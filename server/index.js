// server/index.js

import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Buffer } from 'buffer';
import { pgPool, redisClient } from './config/database.js';
import GameEventService from './services/GameEventService.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// 분리된 모듈들 import
import RedisManager from './services/RedisManager.js';
import GameState from './game/GameState.js';
import MatchManager from './services/MatchManager.js';
import CombatSystem from './game/CombatSystem.js';
import ConnectionManager from './services/ConnectionManager.js';
import WebSocketManager from './network/WebSocketManager.js';
import MessageHandler from './handlers/MessageHandler.js';
import BinaryProtocol from './network/BinaryProtocol.js';
import Debug from './utils/Debug.js';

dotenv.config();

console.log('🔥 Server started');

// 서버 식별자
const SERVER_ID = process.env.SERVER_ID || `server-${Date.now()}`;

// HTTP 서버 및 WebSocket 서버 생성
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

// 핵심 시스템들 초기화
const gameState = new GameState();
const redisManager = new RedisManager(SERVER_ID);
const connectionManager = new ConnectionManager();
const webSocketManager = new WebSocketManager(wss);
const matchManager = new MatchManager(gameState, webSocketManager);
const combatSystem = new CombatSystem(gameState, webSocketManager);
const messageHandler = new MessageHandler(gameState, combatSystem, webSocketManager, redisManager);

// 디버그 헬퍼 설정
const debugHelpers = Debug.createDebugHelpers(redisManager, gameState, connectionManager);

// 전역 디버그 함수들 설정 (개발 환경에서만)
if (process.env.NODE_ENV === 'development') {
  global.debugGame = debugHelpers;
  console.log('🔧 Development mode: Debug functions available as global.debugGame');
  console.log('   - debugGame.getActivePlayers()');
  console.log('   - debugGame.getGameState()');
  console.log('   - debugGame.getConnectionStats()');
  console.log('   - debugGame.getPlayerState(playerId)');
  console.log('   - debugGame.getMatchInfo()');
  console.log('   - debugGame.getSystemStatus()');
}

// Redis 강제 연결 해제 처리
redisManager.on = redisManager.on || (() => {}); // EventEmitter 기능이 없으면 추가
redisManager.handleForceDisconnect = (message) => {
  try {
    const { playerId, oldWsId, serverId, reason } = JSON.parse(message);
    
    // 다른 서버에서 온 요청이거나, 현재 서버의 이전 연결인 경우 처리
    if (serverId !== SERVER_ID || true) { // 모든 요청 처리
      const disconnected = webSocketManager.forceDisconnectByWsId(oldWsId, reason);
      if (disconnected) {
        console.log(`🔌 Force disconnected Player ${playerId} (wsId: ${oldWsId}): ${reason}`);
      }
    }
  } catch (error) {
    console.error('Error processing force disconnect message:', error);
  }
};

// 서버 시작 시 Redis 정리
await redisManager.cleanupPreviousConnections();

// 개발 환경에서 5분마다 Redis 상태 로깅
if (process.env.NODE_ENV === 'development') {
  setInterval(async () => {
    try {
      await debugHelpers.getSystemStatus();
    } catch (error) {
      console.error('Error in periodic status check:', error);
    }
  }, 300000); // 5분마다
}

// WebSocket 연결 처리
wss.on('connection', async (ws, req) => {
  console.log('🔥 New connection');
  
  // 쿼리 파라미터에서 username만 추출
  const url = new URL(req.url, 'http://localhost');
  console.log('url', url);
  const username = url.searchParams.get('username');
  console.log('username', username);
  
  if (!username) {
    console.log('❌ Missing username in connection request');
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Username is required'
    }));
    ws.close(1000, 'Missing username');
    return;
  }
  
  let userId;
  let playerId;
  
  try {
    // 유저 생성 또는 가져오기
    userId = await GameEventService.createOrGetUser(username);
    playerId = userId; // users.id를 playerId로 사용
    
    console.log(`🎯 Username: ${username}, Assigned Player ID: ${playerId} (User ID: ${userId})`);
    
    // Redis 기반 중복 연결 체크 및 강제 재연결 처리
    try {
      const existingConnection = await redisClient.hgetall(`connection:${playerId}`);
      
      if (existingConnection.wsId) {
        console.log(`🔄 Player ${playerId} (${username}) reconnecting - closing old connection`);
        
        // 기존 연결 강제 종료 요청
        await redisManager.forceDisconnectPlayer(playerId, existingConnection.wsId, 'New connection established');
        
        // 기존 상태 정리
        await redisManager.clearPlayerConnectionState(playerId, userId, gameState.getCurrentMatch());
        
        // 메모리에서도 정리
        gameState.removePlayer(playerId);
        connectionManager.removeConnection(playerId);
        
        console.log(`🧹 Cleaned up existing connection for Player ${playerId}`);
      }
    } catch (error) {
      console.error('Error checking/cleaning existing connection:', error);
    }
    
    // 매치 관리
    const matchId = await matchManager.addPlayerToMatch(userId);
    if (matchId) {
      gameState.mapPlayerToUser(playerId, userId);
    }
    
    console.log(`✅ Player ${playerId} (${username}) joined match ${matchId}`);
  } catch (error) {
    console.error('Error setting up player:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to join game: ' + error.message
    }));
    ws.close(1000, 'Database error');
    return;
  }
  
  // WebSocket 객체에 정보 저장
  const wsId = uuidv4();
  ws.playerId = playerId;
  ws.userId = userId;
  ws.username = username;
  ws.wsId = wsId;
  
  // Redis에 연결 상태 저장
  await redisManager.setPlayerConnectionState(playerId, userId, username, gameState.getCurrentMatch(), wsId);
  
  // 연결 관리자에 추가
  connectionManager.addConnection(playerId, ws, userId, username);
  
  // 게임 상태에 플레이어 추가
  gameState.addPlayer(playerId);
  console.log('gameState', gameState);
  console.log('gameState.getAllPlayers()', gameState.getAllPlayers());
  // Send initial state
  ws.send(BinaryProtocol.createStateUpdateBuffer(gameState.getAllPlayers()));

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId: playerId,
    userId: userId,
    username: username,
    matchId: gameState.getCurrentMatch()
  }));
  
  // 다른 플레이어들에게 새 플레이어 참가 알림
  const joinMessage = JSON.stringify({
    type: 'player-joined',
    id: playerId.toString(),
    username: username,
    state: gameState.getPlayer(playerId)
  });
  
  webSocketManager.broadcast(joinMessage, ws);
  
  // 메시지 처리
  ws.on('message', async (message) => {
    // 활동 시간 업데이트
    connectionManager.updateActivity(playerId);
    await redisManager.updatePlayerActivity(playerId, userId);
    
    // 메시지 핸들러에 위임
    await messageHandler.handleMessage(ws, message);
  });
  
  // 연결 종료 처리
  ws.on('close', async () => {
    console.log(`👋 Player ${playerId} disconnected`);
    
    // Redis 연결 상태 정리
    await redisManager.clearPlayerConnectionState(playerId, userId, gameState.getCurrentMatch());
    
    // 게임 상태에서 플레이어 제거
    gameState.removePlayer(playerId);
    
    // 연결 관리자에서 제거
    connectionManager.removeConnection(playerId);
    
    // 매치에서 플레이어 제거
    await matchManager.removePlayerFromMatch(playerId, userId);
    
    // 다른 플레이어들에게 플레이어 퇴장 알림
    const leaveMessage = JSON.stringify({
      type: 'player-left',
      id: playerId.toString()
    });
    
    webSocketManager.broadcast(leaveMessage);
  });
  
  // 에러 처리
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// 서버 시작
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Server ID: ${SERVER_ID}`);
});

// 종료 처리
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  try {
    // 현재 매치 종료
    await matchManager.endMatch();
    
    // 모든 매니저들 정리
    connectionManager.cleanup();
    await redisManager.cleanup();
    
    // 데이터베이스 연결 종료
    await pgPool.end();
    await redisClient.quit();
    await redisPubSub.quit();
    
    console.log('✅ All connections closed gracefully');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  
  process.exit(0);
});

// 예외 처리
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

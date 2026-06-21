// server/index.js

import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Buffer } from 'buffer';
import { pgPool, redisClient, redisPubSub } from './config/database.js';
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
    const { playerId, oldWsId, reason } = JSON.parse(message);

    // 출처 서버와 무관하게 모든 강제 해제 요청을 처리
    const disconnected = webSocketManager.forceDisconnectByWsId(oldWsId, reason);
    if (disconnected) {
      console.log(`🔌 Force disconnected Player ${playerId} (wsId: ${oldWsId}): ${reason}`);
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
/**
 * 플레이어 연결 종료 시 모든 상태(게임 상태/연결/Redis/매치)를 정리하고 다른
 * 플레이어에게 퇴장을 알린다. 'close' 이벤트와 비활성 타임아웃 양쪽에서 호출되며,
 * gameState 존재 여부로 멱등성을 보장한다(먼저 도달한 호출만 실제 정리를 수행).
 */
async function cleanupPlayer(playerId, userId, reason = 'disconnect') {
  if (!gameState.getPlayer(playerId)) {
    return; // 이미 다른 경로에서 정리됨
  }

  console.log(`👋 Player ${playerId} disconnected (${reason})`);

  // 인메모리 상태부터 동기적으로 제거 — 이후 비동기 정리가 실패해도 유령이 남지 않도록
  gameState.removePlayer(playerId);
  connectionManager.removeConnection(playerId);

  // 외부 상태 정리는 best-effort (하나가 실패해도 나머지는 진행)
  try {
    await redisManager.clearPlayerConnectionState(playerId, userId, gameState.getCurrentMatch());
  } catch (error) {
    console.error(`Error clearing Redis state for Player ${playerId}:`, error);
  }
  try {
    await matchManager.removePlayerFromMatch(playerId, userId);
  } catch (error) {
    console.error(`Error removing Player ${playerId} from match:`, error);
  }

  // 다른 플레이어들에게 퇴장 알림
  webSocketManager.broadcast(JSON.stringify({
    type: 'player-left',
    id: playerId.toString()
  }));
}

// 비활성 타임아웃 정리도 동일한 로직을 재사용 (죽은 소켓의 유령 플레이어 방지)
connectionManager.onInactiveDisconnect = cleanupPlayer;

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

  // 클라이언트가 셋업 도중 끊겼을 수 있으므로 초기 전송 전에 연결 상태 확인
  if (ws.readyState === WebSocket.OPEN) {
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
  }
  
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
    await cleanupPlayer(playerId, userId, 'connection closed');
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

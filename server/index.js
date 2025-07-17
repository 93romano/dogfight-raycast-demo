// server/index.js

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Buffer } from 'buffer';
import { pgPool, redisClient } from './config/database.js';
import GameEventService from './services/GameEventService.js';
import dotenv from 'dotenv';
dotenv.config();

console.log('🔥 Server started');


const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

// Game state
const players = new Map();
const gameState = {
  lastUpdate: Date.now(),
  tickRate: 60,
  tickInterval: 1000 / 60,
  lastLogTime: null,
  currentMatchId: null,
  playerUserMap: new Map() // playerId -> userId 매핑
};

// 비활성 사용자 관리
const INACTIVE_TIMEOUT = 120000; // 2분 (120초)
const activeConnections = new Map(); // playerId -> { ws, lastActivity }

// 비활성 사용자 체크 및 제거
function checkInactiveUsers() {
  const now = Date.now();
  
  for (const [playerId, connection] of activeConnections) {
    if (now - connection.lastActivity > INACTIVE_TIMEOUT) {
      console.log(`⏰ Player ${playerId} inactive for ${Math.round((now - connection.lastActivity) / 1000)}s - disconnecting`);
      
      // 연결 강제 종료
      if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(1000, 'Inactive timeout');
      }
      
      // 정리 (close 이벤트에서도 처리되지만 안전장치)
      activeConnections.delete(playerId);
      players.delete(playerId);
      gameState.playerUserMap.delete(playerId);
    }
  }
}

// 30초마다 비활성 사용자 체크
setInterval(checkInactiveUsers, 30000);

// Binary protocol constants
const PACKET_TYPES = {
  STATE_UPDATE: 0x01,
  PLAYER_JOINED: 0x02,
  PLAYER_LEFT: 0x03,
  INPUT: 0x04
};

// Packet header size
const HEADER_SIZE = 8;

// Player state size
const PLAYER_STATE_SIZE = 46; // 2 + 12 + 16 + 12 + 4 bytes

// 매치 시작 함수
async function startMatch() {
  try {
    const matchId = await GameEventService.createMatch();
    gameState.currentMatchId = matchId;
    console.log(`🎮 New match started with ID: ${matchId}`);
    
    // 브로드캐스트 매치 시작
    const matchStartMessage = JSON.stringify({
      type: 'match-started',
      matchId: matchId,
      timestamp: Date.now()
    });
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(matchStartMessage);
      }
    });
    
    return matchId;
  } catch (error) {
    console.error('Error starting match:', error);
    return null;
  }
}

// 매치 종료 함수
async function endMatch() {
  if (!gameState.currentMatchId) return;
  
  try {
    await GameEventService.endMatch(gameState.currentMatchId);
    console.log(`🏁 Match ${gameState.currentMatchId} ended`);
    
    // 브로드캐스트 매치 종료
    const matchEndMessage = JSON.stringify({
      type: 'match-ended',
      matchId: gameState.currentMatchId,
      timestamp: Date.now()
    });
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(matchEndMessage);
      }
    });
    
    gameState.currentMatchId = null;
    gameState.playerUserMap.clear();
  } catch (error) {
    console.error('Error ending match:', error);
  }
}

// 플레이어 킬 처리 함수
async function handlePlayerKill(attackerId, victimId, damage = 100) {
  if (!gameState.currentMatchId) return;
  
  try {
    const attackerUserId = gameState.playerUserMap.get(attackerId);
    const victimUserId = gameState.playerUserMap.get(victimId);
    
    if (attackerUserId && victimUserId) {
      await GameEventService.handlePlayerKill(
        gameState.currentMatchId,
        attackerUserId,
        victimUserId,
        damage
      );
      
      console.log(`💀 Player ${attackerId} killed Player ${victimId}`);
      
      // 킬 이벤트 브로드캐스트
      const killMessage = JSON.stringify({
        type: 'player-killed',
        attackerId: attackerId,
        victimId: victimId,
        damage: damage,
        timestamp: Date.now()
      });
      
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(killMessage);
        }
      });
    }
  } catch (error) {
    console.error('Error handling player kill:', error);
  }
}

// 플레이어 피격 처리 함수 (체력 시스템 포함)
async function handlePlayerHit(attackerId, victimId, damage, position, distance) {
  if (!gameState.currentMatchId) return;
  
  try {
    const attacker = players.get(attackerId);
    const victim = players.get(victimId);
    
    if (!attacker || !victim) {
      console.log(`⚠️ Player not found: attacker=${attackerId}, victim=${victimId}`);
      return;
    }
    
    // 연사 제한 검증
    const now = Date.now();
    if (now - attacker.lastShotTime < attacker.shotCooldown) {
      console.log(`🚫 Shot rejected: Player ${attackerId} shooting too fast`);
      return;
    }
    
    attacker.lastShotTime = now;
    
    // 피해자 체력 감소
    victim.health = Math.max(0, victim.health - damage);
    
    console.log(`🎯 Player ${attackerId} hit Player ${victimId} for ${damage} damage! Victim health: ${victim.health}/${victim.maxHealth}`);
    
    // 모든 클라이언트에게 피격 이벤트 브로드캐스트
    const hitMessage = JSON.stringify({
      type: 'player-hit',
      attackerId: attackerId,
      victimId: victimId,
      damage: damage,
      victimHealth: victim.health,
      position: position,
      distance: distance,
      timestamp: now
    });
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(hitMessage);
      }
    });
    
    // 사망 처리
    if (victim.health <= 0) {
      console.log(`💀 Player ${victimId} was killed by Player ${attackerId}`);
      
      // 킬/데스 이벤트를 Redis에 저장 (사망 시에만)
      const attackerUserId = gameState.playerUserMap.get(attackerId);
      const victimUserId = gameState.playerUserMap.get(victimId);
      
      if (attackerUserId && victimUserId) {
        await GameEventService.handlePlayerKill(
          gameState.currentMatchId,
          attackerUserId,
          victimUserId,
          damage
        );
      }
      
      // 플레이어 리스폰
      victim.health = victim.maxHealth;
      victim.position = [0, 10, 0]; // 리스폰 위치
      victim.rotation = [0, 0, 0, 1];
      
      // 사망/리스폰 이벤트 브로드캐스트
      const deathMessage = JSON.stringify({
        type: 'player-death',
        victimId: victimId,
        attackerId: attackerId,
        respawnPosition: victim.position,
        timestamp: now
      });
      
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(deathMessage);
        }
      });
    }
  } catch (error) {
    console.error('Error handling player hit:', error);
  }
}

// 플레이어 데미지 처리 함수
async function handlePlayerDamage(attackerId, victimId, damage) {
  if (!gameState.currentMatchId) return;
  
  try {
    const attackerUserId = gameState.playerUserMap.get(attackerId);
    const victimUserId = gameState.playerUserMap.get(victimId);
    
    if (attackerUserId && victimUserId) {
      await GameEventService.handlePlayerDamage(
        gameState.currentMatchId,
        attackerUserId,
        victimUserId,
        damage
      );
      
      console.log(`💥 Player ${attackerId} damaged Player ${victimId} for ${damage}`);
      
      // 데미지 이벤트 브로드캐스트
      const damageMessage = JSON.stringify({
        type: 'player-damaged',
        attackerId: attackerId,
        victimId: victimId,
        damage: damage,
        timestamp: Date.now()
      });
      
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(damageMessage);
        }
      });
    }
  } catch (error) {
    console.error('Error handling player damage:', error);
  }
}

function createStateUpdateBuffer(players) {
  const buffer = Buffer.alloc(HEADER_SIZE + (players.size * PLAYER_STATE_SIZE));
  let offset = HEADER_SIZE;
  
  // Write header
  buffer.writeUInt16BE(0, 0); // Sequence number
  buffer.writeUInt8(PACKET_TYPES.STATE_UPDATE, 2);
  buffer.writeUInt32BE(Date.now() % 0xFFFFFFFF, 3); // 32비트 범위로 제한
  buffer.writeUInt8(0, 7); // Flags
  
  // Write player states
  for (const [id, player] of players) {
    buffer.writeUInt16BE(id, offset);
    offset += 2;
    
    // Position (3x float32)
    buffer.writeFloatBE(player.position[0], offset);
    buffer.writeFloatBE(player.position[1], offset + 4);
    buffer.writeFloatBE(player.position[2], offset + 8);
    offset += 12;
    
    // Rotation (4x float32)
    buffer.writeFloatBE(player.rotation[0], offset);
    buffer.writeFloatBE(player.rotation[1], offset + 4);
    buffer.writeFloatBE(player.rotation[2], offset + 8);
    buffer.writeFloatBE(player.rotation[3], offset + 12);
    offset += 16;
    
    // Velocity (3x float32)
    buffer.writeFloatBE(player.velocity[0], offset);
    buffer.writeFloatBE(player.velocity[1], offset + 4);
    buffer.writeFloatBE(player.velocity[2], offset + 8);
    offset += 12;
    
    // Input state (4 bytes)
    buffer.writeUInt32BE(player.inputState, offset);
    offset += 4;
  }
  
  return buffer;
}

// 움직임 이벤트 처리 함수 개선
function handleMovementEvent(playerId, event, ws) {
  const player = players.get(playerId);
  if (!player) {
    console.log(`⚠️ Player ${playerId} not found for movement event`);
    return;
  }

  // 입력 데이터 검증
  if (!event.input) {
    console.log(`⚠️ Missing input data for Player ${playerId}`);
    return;
  }

  console.log(`🎮 Player ${playerId} movement:`, event.input);

  // 입력 상태 업데이트 - 안전한 접근
  player.inputState = {
    forward: Boolean(event.input.forward),
    backward: Boolean(event.input.backward),
    left: Boolean(event.input.left),
    right: Boolean(event.input.right),
    up: Boolean(event.input.up),
    down: Boolean(event.input.down),
    roll: Number(event.input.roll) || 0
  };

  // 위치와 회전 업데이트 - 안전한 접근
  if (event.position && Array.isArray(event.position)) {
    player.position = event.position;
  }
  if (event.rotation && Array.isArray(event.rotation)) {
    player.rotation = event.rotation;
  }
  if (typeof event.speed === 'number') {
    player.speed = event.speed;
  }

  // 다른 플레이어들에게 움직임 이벤트 브로드캐스트
  const movementMessage = JSON.stringify({
    type: 'player-movement',
    playerId: playerId,
    event: event
  });

  let broadcastCount = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== ws) {
      client.send(movementMessage);
      broadcastCount++;
    }
  });

  console.log(`📡 Broadcasted movement to ${broadcastCount} other players`);

  // 움직임 확인 응답
  ws.send(JSON.stringify({
    type: 'movement-ack',
    timestamp: Date.now()
  }));
}

wss.on('connection', async (ws, req) => {
  console.log('🔥 New connection');
  
  // 쿼리 파라미터에서 username만 추출
  const url = new URL(req.url, 'http://localhost');
  const username = url.searchParams.get('username');
  
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
  let playerId; // users 테이블의 id가 playerId가 됨
  
  try {
    // 유저 생성 또는 가져오기 - 이것이 playerId가 됨
    userId = await GameEventService.createOrGetUser(username);
    playerId = userId; // users.id를 playerId로 사용
    
    console.log(`🎯 Username: ${username}, Assigned Player ID: ${playerId} (User ID: ${userId})`);
    
    // 해당 플레이어가 이미 연결되어 있는지 확인
    if (players.has(playerId)) {
      console.log(`❌ Player ID ${playerId} (${username}) is already connected`);
      ws.send(JSON.stringify({
        type: 'error',
        message: `사용자 ${username}가 이미 접속 중입니다.`
      }));
      ws.close(1000, 'User already connected');
      return;
    }
    
    // 매치가 없으면 새 매치 시작
    if (!gameState.currentMatchId) {
      await startMatch();
    }
    
    // 매치에 플레이어 추가
    if (gameState.currentMatchId) {
      await GameEventService.addPlayerToMatch(gameState.currentMatchId, userId);
      gameState.playerUserMap.set(playerId, userId);
    }
    
    console.log(`✅ Player ${playerId} (${username}) joined match ${gameState.currentMatchId}`);
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
  ws.playerId = playerId;
  ws.userId = userId;
  ws.username = username;
  
  // 활성 연결 목록에 추가
  activeConnections.set(playerId, {
    ws: ws,
    lastActivity: Date.now()
  });
  
  // 플레이어 상태 생성
  players.set(playerId, {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    velocity: [0, 0, 0],
    inputState: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      roll: 0
    },
    speed: 0,
    lastInputSequence: 0,
    lastActivity: Date.now(),
    lastPingLog: null,
    lastPositionLog: null,
    lastBroadcastLog: null,
    lastMovementLog: null,
    // 체력 시스템 추가
    health: 100,
    maxHealth: 100,
    lastShotTime: 0,
    shotCooldown: 500 // 0.5초
  });
  
  // Send initial state
  ws.send(createStateUpdateBuffer(players));

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId: playerId,
    userId: userId,
    username: username,
    matchId: gameState.currentMatchId
  }));
  
  // 다른 플레이어들에게 새 플레이어 참가 알림
  const joinMessage = JSON.stringify({
    type: 'player-joined',
    id: playerId.toString(),
    username: username,
    state: players.get(playerId)
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== ws) {
      client.send(joinMessage);
    }
  });
  
  // 메시지 처리
  ws.on('message', async (message) => {
    try {
      // 활동 시간 업데이트
      const connection = activeConnections.get(playerId);
      if (connection) {
        connection.lastActivity = Date.now();
      }
      
      // ping 메시지는 JSON이 아닐 수 있으므로 먼저 확인
      if (message.toString() === 'ping') {
        ws.send('pong');
        return;
      }
      
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'movement':
          handleMovementEvent(playerId, data, ws);
          break;
          
        case 'hit':
          if (data.victimId && data.victimId !== playerId) {
            await handlePlayerHit(playerId, data.victimId, data.damage, data.position, data.distance);
          }
          break;
          
        case 'kill':
          if (data.victimId && data.victimId !== playerId) {
            await handlePlayerKill(playerId, data.victimId, data.damage);
          }
          break;
          
        case 'damage':
          if (data.victimId && data.victimId !== playerId) {
            await handlePlayerDamage(playerId, data.victimId, data.damage);
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          break;
          
        case 'get-stats':
          if (gameState.currentMatchId) {
            const stats = await GameEventService.getMatchPlayerStats(gameState.currentMatchId);
            ws.send(JSON.stringify({
              type: 'match-stats',
              stats: stats
            }));
          }
          break;
          
        case 'get-rankings':
          const rankings = await GameEventService.getGlobalRankings();
          ws.send(JSON.stringify({
            type: 'global-rankings',
            rankings: rankings
          }));
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // 연결 종료 처리
  ws.on('close', () => {
    console.log(`👋 Player ${playerId} disconnected`);
    
    // 플레이어 제거
    players.delete(playerId);
    gameState.playerUserMap.delete(playerId);
    activeConnections.delete(playerId); // 활성 연결 목록에서도 제거
    
    // 다른 플레이어들에게 플레이어 퇴장 알림
    const leaveMessage = JSON.stringify({
      type: 'player-left',
      id: playerId.toString()
    });
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(leaveMessage);
      }
    });
    
    // 플레이어가 모두 나가면 매치 종료
    if (players.size === 0 && gameState.currentMatchId) {
      endMatch();
    }
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
});

// 종료 처리
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // 현재 매치 종료
  if (gameState.currentMatchId) {
    await endMatch();
  }
  
  // 연결 종료
  await pgPool.end();
  await redisClient.quit();
  
  process.exit(0);
});

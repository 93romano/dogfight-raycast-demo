// server/index.js

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Buffer } from 'buffer';

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

// Game state
const players = new Map();
const gameState = {
  lastUpdate: Date.now(),
  tickRate: 60,
  tickInterval: 1000 / 60,
  lastLogTime: null
};

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

  console.log(`🎮 Player ${playerId} movement:`, event.input);

  // 입력 상태 업데이트
  player.inputState = {
    forward: event.input.forward,
    backward: event.input.backward,
    left: event.input.left,
    right: event.input.right,
    up: event.input.up,
    down: event.input.down,
    roll: event.input.roll
  };

  // 위치와 회전 업데이트
  player.position = event.position;
  player.rotation = event.rotation;
  player.speed = event.speed;

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

wss.on('connection', (ws, req) => {
  console.log('�� New connection');
  
  // 쿼리 파라미터에서 사용자가 입력한 Player ID 추출
  const url = new URL(req.url, 'http://localhost');
  const requestedPlayerId = parseInt(url.searchParams.get('playerId'));
  
  let playerId;
  
  // 사용자가 요청한 ID가 유효한지 확인
  if (requestedPlayerId && requestedPlayerId >= 1 && requestedPlayerId <= 9999) {
    // ID 충돌 체크
    if (players.has(requestedPlayerId)) {
      // 충돌 시 에러 메시지 전송
      ws.send(JSON.stringify({
        type: 'player-id-conflict',
        message: `Player ID ${requestedPlayerId} is already in use`
      }));
      ws.close(1000, 'Player ID conflict');
      return;
    }
    
    playerId = requestedPlayerId;
    console.log(`🎯 User requested Player ID: ${playerId}`);
  } else {
    // 유효하지 않은 ID 요청 시 에러
    ws.send(JSON.stringify({
      type: 'player-id-conflict',
      message: 'Invalid Player ID. Must be between 1-9999.'
    }));
    ws.close(1000, 'Invalid Player ID');
    return;
  }
  
  // WebSocket 객체에 정보 저장
  ws.playerId = playerId;
  
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
    lastMovementLog: null
  });
  
  // Send initial state
  ws.send(createStateUpdateBuffer(players));

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId: playerId
  }));
  
  // 다른 플레이어들에게 새 플레이어 참가 알림
  const joinMessage = JSON.stringify({
    type: 'player-joined',
    id: playerId.toString(),
    state: players.get(playerId)
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== ws) {
      client.send(joinMessage);
    }
  });
  
  ws.on('message', (data) => {
    // 활동 시간 업데이트
    const now = Date.now();
    const player = players.get(playerId);
    if (player) {
      player.lastActivity = now;
    }
    
    try {
      // Keep-alive 처리
      if (typeof data === 'string' && data === 'ping') {
        ws.send('pong');
        return;
      }

      // JSON 메시지 처리
      if (typeof data === 'string') {
        const message = JSON.parse(data);
        
        switch (message.type) {
          case 'update':
            const updatePlayerId = message.playerId || playerId;
            const player = players.get(updatePlayerId);
            if (player) {
              // 위치 업데이트 로그 줄임 - 5초마다만
              if (!player.lastPositionLog || now - player.lastPositionLog > 5000) {
                console.log(`🔄 Updating player ${updatePlayerId} position:`, message.state.position);
                player.lastPositionLog = now;
              }
              
              // 플레이어 상태 업데이트
              player.position = message.state.position;
              player.rotation = message.state.rotation;
              
              // 하이브리드: JSON을 바이너리로 변환해서 브로드캐스트
              const binaryUpdate = createPlayerUpdateBuffer(updatePlayerId, message.state);
              
              let broadcastCount = 0;
              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client !== ws) {
                  client.send(binaryUpdate);
                  broadcastCount++;
                }
              });
              
              if (broadcastCount > 0) {
                console.log(`📡 Broadcasted binary position update to ${broadcastCount} other players`);
              }
            }
            break;
          case 'movement':
            // 움직임 이벤트는 JSON으로 브로드캐스트 (구조화된 데이터)
            const eventPlayerId = message.playerId || playerId;
            const movementMessage = JSON.stringify({
              type: 'player-movement',
              playerId: eventPlayerId,
              event: message.event
            });
            
            let movementBroadcastCount = 0;
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN && client !== ws) {
                client.send(movementMessage);
                movementBroadcastCount++;
              }
            });
            
            if (movementBroadcastCount > 0) {
              console.log(`📡 Broadcasted movement event to ${movementBroadcastCount} other players`);
            }
            break;
          default:
            console.log('Unknown message type:', message.type);
        }
      } else if (data instanceof Buffer) {
        // 기존 바이너리 처리 로직 유지
        console.log(`📦 Binary data received from player ${playerId}, length:`, data.length);
        
        let broadcastCount = 0;
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && client !== ws) {
            client.send(data);
            broadcastCount++;
          }
        });
        
        if (broadcastCount > 0) {
          console.log(`📡 Broadcasted binary data to ${broadcastCount} other players`);
        }
      } else {
        console.log(`❓ Unknown data type from player ${playerId}:`, typeof data);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔌 Connection closed for player ${playerId}. Code: ${code}, Reason: ${reason}`);
    
    // 플레이어 제거
    players.delete(playerId);
    
    // 다른 클라이언트에게 알림
    const leaveMessage = JSON.stringify({
      type: 'player-left',
      playerId: playerId
    });
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(leaveMessage);
      }
    });
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for player ${playerId}:`, error);
  });
});

// 연결 상태 모니터링 (선택사항)
setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 5 * 60 * 1000; // 5분
  
  for (const [id, player] of players) {
    if (now - player.lastActivity > inactiveThreshold) {
      console.log(`⏰ Player ${id} inactive for ${Math.floor((now - player.lastActivity) / 1000)}s`);
      // 여기서는 연결을 끊지 않고 로그만 남김
    }
  }
}, 60000); // 1분마다 체크

// Game loop 개선 - 로그 빈도 줄임
setInterval(() => {
  const now = Date.now();
  if (now - gameState.lastUpdate >= gameState.tickInterval) {
    gameState.lastUpdate = now;
    
    // 모든 플레이어 상태를 바이너리로 브로드캐스트
    const stateBuffer = createStateUpdateBuffer(players);
    let broadcastCount = 0;
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(stateBuffer);
        broadcastCount++;
      }
    });
    
    // 로그 빈도 줄임 - 10초마다만 출력
    if (broadcastCount > 0 && players.size > 0) {
      if (!gameState.lastLogTime || now - gameState.lastLogTime > 10000) {
        console.log(`📡 Broadcasted state to ${broadcastCount} clients (${players.size} players)`);
        gameState.lastLogTime = now;
      }
    }
  }
}, 1);

// 새로운 함수: 개별 플레이어 업데이트를 바이너리로 변환
function createPlayerUpdateBuffer(playerId, state) {
  const buffer = Buffer.alloc(HEADER_SIZE + PLAYER_STATE_SIZE);
  let offset = HEADER_SIZE;
  
  // Write header
  buffer.writeUInt16BE(0, 0); // Sequence number
  buffer.writeUInt8(PACKET_TYPES.STATE_UPDATE, 2); // Packet type
  buffer.writeUInt32BE(Date.now(), 3); // Timestamp
  buffer.writeUInt8(0, 7); // Flags
  
  // Write player ID
  buffer.writeUInt16BE(parseInt(playerId), offset);
  offset += 2;
  
  // Write position (3x float32)
  buffer.writeFloatBE(state.position[0], offset);
  buffer.writeFloatBE(state.position[1], offset + 4);
  buffer.writeFloatBE(state.position[2], offset + 8);
  offset += 12;
  
  // Write rotation (4x float32)
  buffer.writeFloatBE(state.rotation[0], offset);
  buffer.writeFloatBE(state.rotation[1], offset + 4);
  buffer.writeFloatBE(state.rotation[2], offset + 8);
  buffer.writeFloatBE(state.rotation[3], offset + 12);
  offset += 16;
  
  // Write velocity (3x float32) - zeros
  buffer.writeFloatBE(0, offset);
  buffer.writeFloatBE(0, offset + 4);
  buffer.writeFloatBE(0, offset + 8);
  offset += 12;
  
  // Write input state (4 bytes) - zeros
  buffer.writeUInt32BE(0, offset);
  
  return buffer;
}

httpServer.listen(3000, () => {
  console.log('🚀 Zero-lag FPS server running on http://localhost:3000');
});

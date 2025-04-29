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
  tickInterval: 1000 / 60
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
  buffer.writeUInt32BE(Date.now(), 3);
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

wss.on('connection', (ws) => {
  const playerId = Date.now() & 0xFFFF; // 16-bit player ID
  
  // Initialize player state
  players.set(playerId, {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    velocity: [0, 0, 0],
    inputState: 0,
    lastInputSequence: 0
  });
  
  // Send initial state
  ws.send(createStateUpdateBuffer(players));
  
  ws.on('message', (data) => {
    if (!(data instanceof Buffer)) return;
    
    const packetType = data.readUInt8(2);
    if (packetType === PACKET_TYPES.INPUT) {
      const sequence = data.readUInt16BE(0);
      const inputState = data.readUInt32BE(HEADER_SIZE);
      
      const player = players.get(playerId);
      if (sequence > player.lastInputSequence) {
        player.lastInputSequence = sequence;
        player.inputState = inputState;
        
        // Process input and update state
        // This would include physics calculations, etc.
      }
    }
  });
  
  ws.on('close', () => {
    players.delete(playerId);
  });
});

// Game loop
setInterval(() => {
  const now = Date.now();
  if (now - gameState.lastUpdate >= gameState.tickInterval) {
    gameState.lastUpdate = now;
    
    // Broadcast state to all clients
    const stateBuffer = createStateUpdateBuffer(players);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(stateBuffer);
      }
    });
  }
}, 1);

httpServer.listen(3000, () => {
  console.log('🚀 Zero-lag FPS server running on http://localhost:3000');
});

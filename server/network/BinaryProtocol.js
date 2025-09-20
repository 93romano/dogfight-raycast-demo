import { Buffer } from 'buffer';

// Binary protocol constants
export const PACKET_TYPES = {
  STATE_UPDATE: 0x01,
  PLAYER_JOINED: 0x02,
  PLAYER_LEFT: 0x03,
  INPUT: 0x04
};

// Packet header size
export const HEADER_SIZE = 8;

// Player state size
export const PLAYER_STATE_SIZE = 46; // 2 + 12 + 16 + 12 + 4 bytes

export class BinaryProtocol {
  static createStateUpdateBuffer(players) {
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
      const inputState = this.encodeInputState(player.inputState);
      buffer.writeUInt32BE(inputState, offset);
      offset += 4;
    }
    
    return buffer;
  }

  static encodeInputState(inputState) {
    let encoded = 0;
    if (inputState.forward) encoded |= 0x01;
    if (inputState.backward) encoded |= 0x02;
    if (inputState.left) encoded |= 0x04;
    if (inputState.right) encoded |= 0x08;
    if (inputState.up) encoded |= 0x10;
    if (inputState.down) encoded |= 0x20;
    // roll은 별도로 처리 (float 값)
    return encoded;
  }

  static decodeInputState(encoded) {
    return {
      forward: (encoded & 0x01) !== 0,
      backward: (encoded & 0x02) !== 0,
      left: (encoded & 0x04) !== 0,
      right: (encoded & 0x08) !== 0,
      up: (encoded & 0x10) !== 0,
      down: (encoded & 0x20) !== 0,
      roll: 0 // 별도 처리 필요
    };
  }
}

export default BinaryProtocol; 
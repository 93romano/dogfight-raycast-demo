import { EventEmitter } from 'events';

interface PlayerState {
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity: [number, number, number];
  inputState: number;
  lastInputSequence: number;
}

interface GameState {
  players: Map<number, PlayerState>;
  lastServerUpdate: number;
  pendingInputs: Array<{
    sequence: number;
    inputState: number;
    timestamp: number;
  }>;
}

export class NetworkManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private gameState: GameState = {
    players: new Map(),
    lastServerUpdate: 0,
    pendingInputs: []
  };
  
  private sequence = 0;
  private lastProcessedSequence = 0;
  private interpolationBuffer: Array<{
    timestamp: number;
    state: Map<number, PlayerState>;
  }> = [];
  
  private readonly BUFFER_SIZE = 3; // 3 frames of interpolation buffer
  private readonly TICK_RATE = 60;
  private readonly TICK_INTERVAL = 1000 / 60;
  
  private lastLogTime = 0;
  private readonly logInterval = 5000; // 5초마다만 로그 출력
  
  constructor() {
    super();
  }
  
  connect(url: string) {
    this.ws = new WebSocket(url);
    
    this.ws.binaryType = 'arraybuffer';
    
    this.ws.onopen = () => {
      console.log('Connected to game server');
      this.emit('connected');
    };
    
    this.ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      
      // 로그 빈도 줄이기
      const now = Date.now();
      if (!this.lastLogTime || now - this.lastLogTime > this.logInterval) {
        console.log('Received message from server', event.data);
        this.lastLogTime = now;
      }
      
      const buffer = new DataView(event.data);
      const packetType = buffer.getUint8(2);
      
      if (packetType === 0x01) { // STATE_UPDATE
        this.processStateUpdate(buffer);
      }
    };
    
    this.ws.onclose = () => {
      console.log('Disconnected from game server');
      this.emit('disconnected');
    };
  }
  
  private processStateUpdate(buffer: DataView) {
    const timestamp = buffer.getUint32(3);
    const playerCount = (buffer.byteLength - 8) / 46;
    
    const newState = new Map<number, PlayerState>();
    let offset = 8;
    
    for (let i = 0; i < playerCount; i++) {
      const playerId = buffer.getUint16(offset);
      // 로그 제거 - 너무 자주 발생
      offset += 2;
      
      const position: [number, number, number] = [
        buffer.getFloat32(offset),
        buffer.getFloat32(offset + 4),
        buffer.getFloat32(offset + 8)
      ];
      offset += 12;
      
      const rotation: [number, number, number, number] = [
        buffer.getFloat32(offset),
        buffer.getFloat32(offset + 4),
        buffer.getFloat32(offset + 8),
        buffer.getFloat32(offset + 12)
      ];
      offset += 16;
      
      const velocity: [number, number, number] = [
        buffer.getFloat32(offset),
        buffer.getFloat32(offset + 4),
        buffer.getFloat32(offset + 8)
      ];
      offset += 12;
      
      const inputState = buffer.getUint32(offset);
      offset += 4;
      
      newState.set(playerId, {
        position,
        rotation,
        velocity,
        inputState,
        lastInputSequence: 0
      });
    }
    
    // Add to interpolation buffer
    this.interpolationBuffer.push({
      timestamp,
      state: newState
    });
    
    // Keep buffer size limited
    if (this.interpolationBuffer.length > this.BUFFER_SIZE) {
      this.interpolationBuffer.shift();
    }
    
    this.gameState.lastServerUpdate = timestamp;
    this.reconcileStates();
  }
  
  sendInput(inputState: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    this.sequence++;
    
    const buffer = new ArrayBuffer(12); // 8 bytes header + 4 bytes input
    const view = new DataView(buffer);
    
    // Write header
    view.setUint16(0, this.sequence);
    view.setUint8(2, 0x04); // INPUT packet type
    view.setUint32(3, Date.now());
    view.setUint8(7, 0);
    
    // Write input state
    view.setUint32(8, inputState);
    
    this.ws.send(buffer);
    
    // Store input for reconciliation
    this.gameState.pendingInputs.push({
      sequence: this.sequence,
      inputState,
      timestamp: Date.now()
    });
  }
  
  private reconcileStates() {
    // Find the most recent confirmed state
    const confirmedState = this.interpolationBuffer[this.interpolationBuffer.length - 1];
    if (!confirmedState) return;
    
    // Replay unconfirmed inputs
    const unconfirmedInputs = this.gameState.pendingInputs.filter(
      input => input.sequence > this.lastProcessedSequence
    );
    
    for (const input of unconfirmedInputs) {
      // Apply input to local state
      // This would include physics calculations, etc.
      this.lastProcessedSequence = input.sequence;
    }
    
    // Remove processed inputs
    this.gameState.pendingInputs = this.gameState.pendingInputs.filter(
      input => input.sequence > this.lastProcessedSequence
    );
  }
  
  getInterpolatedState(timestamp: number): Map<number, PlayerState> {
    if (this.interpolationBuffer.length < 2) {
      return this.gameState.players;
    }
    
    // Find the two states to interpolate between
    let olderState = this.interpolationBuffer[0];
    let newerState = this.interpolationBuffer[1];
    
    for (let i = 1; i < this.interpolationBuffer.length; i++) {
      if (this.interpolationBuffer[i].timestamp > timestamp) {
        newerState = this.interpolationBuffer[i];
        olderState = this.interpolationBuffer[i - 1];
        break;
      }
    }
    
    const alpha = (timestamp - olderState.timestamp) / 
                 (newerState.timestamp - olderState.timestamp);
    
    const interpolatedState = new Map<number, PlayerState>();
    
    // Interpolate between states
    for (const [id, oldPlayer] of olderState.state) {
      const newPlayer = newerState.state.get(id);
      if (!newPlayer) continue;
      
      interpolatedState.set(id, {
        position: [
          oldPlayer.position[0] + (newPlayer.position[0] - oldPlayer.position[0]) * alpha,
          oldPlayer.position[1] + (newPlayer.position[1] - oldPlayer.position[1]) * alpha,
          oldPlayer.position[2] + (newPlayer.position[2] - oldPlayer.position[2]) * alpha
        ],
        rotation: [
          oldPlayer.rotation[0] + (newPlayer.rotation[0] - oldPlayer.rotation[0]) * alpha,
          oldPlayer.rotation[1] + (newPlayer.rotation[1] - oldPlayer.rotation[1]) * alpha,
          oldPlayer.rotation[2] + (newPlayer.rotation[2] - oldPlayer.rotation[2]) * alpha,
          oldPlayer.rotation[3] + (newPlayer.rotation[3] - oldPlayer.rotation[3]) * alpha
        ],
        velocity: [
          oldPlayer.velocity[0] + (newPlayer.velocity[0] - oldPlayer.velocity[0]) * alpha,
          oldPlayer.velocity[1] + (newPlayer.velocity[1] - oldPlayer.velocity[1]) * alpha,
          oldPlayer.velocity[2] + (newPlayer.velocity[2] - oldPlayer.velocity[2]) * alpha
        ],
        inputState: newPlayer.inputState,
        lastInputSequence: newPlayer.lastInputSequence
      });
    }
    
    return interpolatedState;
  }
} 
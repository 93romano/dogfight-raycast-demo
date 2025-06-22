// client/network/SocketManager.ts

export interface PlayerState {
  position: number[]; // [x, y, z]
  rotation: number[]; // [x, y, z, w] quaternion
}

export interface MovementEvent {
  type: 'movement';
  input: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    roll: number; // -1 to 1
  };
  position: number[];
  rotation: number[];
  speed: number;
}

export type PlayerUpdateCallback = (id: string, state: PlayerState) => void;
export type PlayerLeaveCallback = (id: string) => void;
export type PlayerMovementCallback = (id: string, event: MovementEvent) => void;

export class SocketManager {
  private socket: WebSocket | null = null;
  private playerId: number | null = null;
  private lastSentState: PlayerState | null = null;
  private lastSentMovement: MovementEvent | null = null;
  private readonly stateThreshold = 0.1; // 위치 변화 임계값
  private readonly rotationThreshold = 0.01; // 회전 변화 임계값
  
  // 연결 안정성을 위한 변수들
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 500;
  private keepAliveInterval: number | null = null;
  private keepAliveTimeout: number | null = null;
  private readonly keepAliveIntervalMs = 15000; // 15초마다 ping (더 자주)
  private readonly keepAliveTimeoutMs = 3000;   // 3초 타임아웃 (더 짧게)

  // 로그 제어를 위한 변수들 추가
  private lastLogTime = 0;
  private readonly logInterval = 5000; // 5초마다만 로그 출력
  private binaryPacketCount = 0;
  private lastBinaryLogTime = 0;

  constructor(
    private onJoin: PlayerUpdateCallback,
    private onUpdate: PlayerUpdateCallback,
    private onLeave: PlayerLeaveCallback,
    private onInitAll: (players: Record<string, PlayerState>) => void,
    private onMovement: PlayerMovementCallback
  ) {
    // 생성자에서는 연결하지 않음
  }

  public connectWithPlayerId(playerId: number) {
    this.playerId = playerId;
    console.log('🎯 Connecting with Player ID:', playerId);
    this.connect();
  }

  private connect() {
    try {
      console.log('🔌 Attempting to connect to server...');
      
      // 사용자가 입력한 Player ID를 쿼리 파라미터로 전달
      const params = new URLSearchParams();
      params.append('playerId', this.playerId!.toString());
      
      const wsUrl = `ws://localhost:3000?${params.toString()}`;
      this.socket = new WebSocket(wsUrl);
      
      this.socket.binaryType = 'arraybuffer';
      this.bindEvents();
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private bindEvents() {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log('✅ Connected to server');
      this.reconnectAttempts = 0;
      this.startKeepAlive();
    };

    this.socket.onmessage = (event) => {
      // Keep-alive 응답 처리
      if (event.data === 'pong') {
        console.log('🏓 Received pong from server');
        this.resetKeepAliveTimeout();
        return;
      }

      // 메시지 타입 확인 및 처리
      if (typeof event.data === 'string') {
        this.handleTextMessage(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        console.log('📦 Received binary data, length:', event.data.byteLength);
        this.handleBinaryMessage(event.data);
      } else {
        console.log('❓ Unknown message type:', typeof event.data, event.data);
      }
    };

    this.socket.onclose = (event) => {
      console.log(`❌ Disconnected from server. Code: ${event.code}, Reason: ${event.reason}`);
      this.stopKeepAlive();
      
      // 정상적인 종료가 아닌 경우 재연결 시도
      if (event.code !== 1000 && event.code !== 1001) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.stopKeepAlive();
    };
  }

  private handleTextMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      
      // 로그 빈도 줄이기 - 5초마다만 출력
      const now = Date.now();
      if (!this.lastLogTime || now - this.lastLogTime > this.logInterval) {
        console.log('🔌 Received JSON message:', msg.type);
        this.lastLogTime = now;
      }
      
      switch (msg.type) {
        case 'welcome':
          console.log('🎯 Connected successfully with Player ID:', this.playerId);
          break;
        case 'player-id-conflict':
          // ID 충돌 시 처리
          console.error('❌ Player ID conflict:', msg.message);
          alert(`플레이어 번호 ${this.playerId}가 이미 사용 중입니다. 다른 번호를 선택해주세요.`);
          this.disconnect();
          break;
        case 'player-joined':
          this.onJoin(msg.id, msg.state);
          break;
        case 'player-update':
          this.onUpdate(msg.id, msg.state);
          break;
        case 'player-left':
          this.onLeave(msg.id);
          break;
        case 'all-players':
          this.onInitAll(msg.players);
          break;
        case 'player-movement':
          this.onMovement(msg.playerId, msg.event);
          break;
        case 'movement-ack':
          // 로그 제거 - 너무 자주 발생
          break;
        default:
          if (!this.lastLogTime || now - this.lastLogTime > this.logInterval) {
            console.log('Unknown JSON message type:', msg.type);
          }
      }
    } catch (e) {
      console.error('JSON Parse error:', e, data);
    }
  }

  private handleBinaryMessage(data: ArrayBuffer) {
    try {
      const buffer = new Uint8Array(data);
      this.processBinaryBuffer(buffer);
    } catch (error) {
      console.error('Error processing binary message:', error);
    }
  }

  private processBinaryBuffer(buffer: Uint8Array) {
    try {
      if (buffer.length < 8) {
        return; // 로그 제거
      }

      const sequence = (buffer[0] << 8) | buffer[1];
      const packetType = buffer[2];
      const timestamp = (buffer[3] << 24) | (buffer[4] << 16) | (buffer[5] << 8) | buffer[6];
      const flags = buffer[7];

      // 바이너리 패킷 로그 빈도 줄이기 - 10초마다만 출력
      this.binaryPacketCount++;
      const now = Date.now();
      if (!this.lastBinaryLogTime || now - this.lastBinaryLogTime > 10000) {
        console.log(`📦 Binary packets received: ${this.binaryPacketCount} (type=${packetType}, size=${buffer.length})`);
        this.binaryPacketCount = 0;
        this.lastBinaryLogTime = now;
      }

      if (packetType === 0x01) { // STATE_UPDATE
        this.processStateUpdate(buffer);
      }
    } catch (error) {
      console.error('Error processing binary buffer:', error);
    }
  }

  private processStateUpdate(buffer: Uint8Array) {
    const HEADER_SIZE = 8;
    const PLAYER_STATE_SIZE = 46;
    let offset = HEADER_SIZE;

    while (offset + PLAYER_STATE_SIZE <= buffer.length) {
      const playerId = (buffer[offset] << 8) | buffer[offset + 1];
      offset += 2;

      // Position (3x float32)
      const position = [
        this.readFloatBE(buffer, offset),
        this.readFloatBE(buffer, offset + 4),
        this.readFloatBE(buffer, offset + 8)
      ];
      offset += 12;

      // Rotation (4x float32)
      const rotation = [
        this.readFloatBE(buffer, offset),
        this.readFloatBE(buffer, offset + 4),
        this.readFloatBE(buffer, offset + 8),
        this.readFloatBE(buffer, offset + 12)
      ];
      offset += 16;

      // Velocity (3x float32) - 사용하지 않음
      offset += 12;

      // Input state (4 bytes) - 사용하지 않음
      offset += 4;

      const state: PlayerState = { position, rotation };
      
      // 내 플레이어가 아닌 경우에만 업데이트
      if (this.playerId !== playerId) {
        this.onUpdate(playerId.toString(), state);
      }
    }
  }

  private readFloatBE(buffer: Uint8Array, offset: number): number {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    return view.getFloat32(0, false); // big-endian
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    
    this.keepAliveInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log('🏓 Sending ping to server');
        this.socket.send('ping');
        
        // Pong 응답 대기
        this.resetKeepAliveTimeout();
      }
    }, this.keepAliveIntervalMs) as any;
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout);
      this.keepAliveTimeout = null;
    }
  }

  private resetKeepAliveTimeout() {
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout);
    }
    
    this.keepAliveTimeout = setTimeout(() => {
      console.log('⏰ Keep-alive timeout - reconnecting');
      this.reconnect();
    }, this.keepAliveTimeoutMs) as any;
  }

  private reconnect() {
    console.log('🔄 Attempting to reconnect...');
    if (this.socket) {
      this.socket.close();
    }
    this.connect();
  }

  public sendState(state: PlayerState) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return; // 로그 제거
    }

    if (this.hasStateChanged(state)) {
      const message = { 
        type: 'update', 
        state,
        playerId: this.playerId 
      };
      
      // 로그 빈도 줄이기 - 5초마다만 출력
      const now = Date.now();
      if (!this.lastLogTime || now - this.lastLogTime > this.logInterval) {
        console.log('🔌 Sending state update');
        this.lastLogTime = now;
      }
      
      this.socket.send(JSON.stringify(message));
      this.lastSentState = { ...state };
    }
  }

  public sendMovementEvent(event: MovementEvent) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return; // 로그 제거
    }

    // 로그 빈도 줄이기 - 5초마다만 출력
    const now = Date.now();
    if (!this.lastLogTime || now - this.lastLogTime > this.logInterval) {
      console.log('🔌 Sending movement event');
      this.lastLogTime = now;
    }
    
    this.socket.send(JSON.stringify({ 
      type: 'movement', 
      event,
      playerId: this.playerId 
    }));
    this.lastSentMovement = { ...event };
  }

  private hasStateChanged(newState: PlayerState): boolean {
    if (!this.lastSentState) return true;

    // 위치 변화 확인
    const posDiff = Math.sqrt(
      Math.pow(newState.position[0] - this.lastSentState.position[0], 2) +
      Math.pow(newState.position[1] - this.lastSentState.position[1], 2) +
      Math.pow(newState.position[2] - this.lastSentState.position[2], 2)
    );

    // 회전 변화 확인
    const rotDiff = Math.sqrt(
      Math.pow(newState.rotation[0] - this.lastSentState.rotation[0], 2) +
      Math.pow(newState.rotation[1] - this.lastSentState.rotation[1], 2) +
      Math.pow(newState.rotation[2] - this.lastSentState.rotation[2], 2) +
      Math.pow(newState.rotation[3] - this.lastSentState.rotation[3], 2)
    );

    return posDiff > this.stateThreshold || rotDiff > this.rotationThreshold;
  }

  public getPlayerId(): number | null {
    return this.playerId;
  }

  public getSocketId(): string {
    return this.playerId?.toString() || 'unknown';
  }

  public isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public disconnect() {
    this.stopKeepAlive();
    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
    }
  }
}

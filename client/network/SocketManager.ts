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
export type PlayerHitCallback = (attackerId: string, victimId: string, damage: number, victimHealth: number) => void;
export type PlayerDeathCallback = (victimId: string, attackerId: string, respawnPosition: number[]) => void;
export type DisconnectCallback = (info: { code: number; reason: string; wasClean: boolean }) => void;

export class SocketManager {
  private socket: WebSocket | null = null;
  private playerId: number | null = null;
  private username: string | null = null;
  private lastSentState: PlayerState | null = null;
  private readonly stateThreshold = 0.1; // 위치 변화 임계값
  private readonly rotationThreshold = 0.01; // 회전 변화 임계값
  
  // 연결 안정성을 위한 변수들
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 500;
  private keepAliveInterval: number | null = null;
  private keepAliveTimeout: number | null = null;
  private readonly keepAliveIntervalMs = 120000; // 2분마다 ping
  private readonly keepAliveTimeoutMs = 10000;   // 10초 타임아웃
  
  // 연속 ping 실패 카운트 (1번 실패하면 재연결)
  private consecutivePingFailures = 0;
  private readonly maxConsecutivePingFailures = 1; // 1번 실패 시 재연결

  // 로그 제어를 위한 변수들 추가
  private lastLogTime = 0;
  private readonly logInterval = 5000; // 5초마다만 로그 출력
  private binaryPacketCount = 0;
  private lastBinaryLogTime = 0;
  
  // 초기 스냅샷 처리 상태
  private initialStateBuffered: Record<string, PlayerState> | null = null;
  private initialStateProcessed = false;

  constructor(
    private onJoin: PlayerUpdateCallback,
    private onUpdate: PlayerUpdateCallback,
    private onLeave: PlayerLeaveCallback,
    private onInitAll: (players: Record<string, PlayerState>) => void,
    private onMovement: PlayerMovementCallback,
    private onHit?: PlayerHitCallback,
    private onDeath?: PlayerDeathCallback,
    private onDisconnect?: DisconnectCallback
  ) {
    // 생성자에서는 연결하지 않음
  }

  /**
   * Connect with username only - server will assign player ID based on user ID
   */
  public connectWithUsername(username: string) {
    this.username = username;
    this.playerId = null; // 서버에서 할당받을 예정
    console.log('🎯 Connecting with Username:', username);
    this.connect();
  }

  private connect() {
    try {
      console.log('🔌 Attempting to connect to server...');
      
      // 사용자명만 쿼리 파라미터로 전달
      const params = new URLSearchParams();
      if (this.username) {
        params.append('username', this.username);
      }
      
      const wsUrl = `ws://localhost:8080?${params.toString()}`;
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
      this.consecutivePingFailures = 0; // 연결 성공 시 ping 실패 카운트 리셋
      this.startKeepAlive();
    };

    this.socket.onmessage = (event) => {
      // Keep-alive 응답 처리
      if (event.data === 'pong') {
        console.log('🏓 Received pong from server');
        this.consecutivePingFailures = 0; // 성공 시 실패 카운트 리셋
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

      this.onDisconnect?.({
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });

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
          // 서버에서 할당받은 플레이어 ID 저장
          this.playerId = msg.playerId;
          console.log('🎯 Connected successfully with Player ID:', this.playerId, 'Username:', msg.username);
          // welcome 수신 후, 버퍼링된 초기 스냅샷이 있으면 플러시
          this.flushInitialSnapshot();
          break;
        case 'player-id-conflict':
        case 'error':
          // 에러 메시지 처리
          console.error('❌ Connection error:', msg.message);
          alert(msg.message);
          this.disconnect();
          break;
        case 'player-joined':
          console.log('socket-manager-player-joined', msg);
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
        case 'player-hit':
          // 피격 이벤트 처리
          if (this.onHit) {
            this.onHit(msg.attackerId.toString(), msg.victimId.toString(), msg.damage, msg.victimHealth);
          }
          break;
        case 'player-death':
          // 사망 이벤트 처리
          if (this.onDeath) {
            this.onDeath(msg.victimId.toString(), msg.attackerId.toString(), msg.respawnPosition);
          }
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
    
    // 전체 스냅샷을 누적
    const players: Record<string, PlayerState> = {};
    const parsedIds: number[] = [];
    while (offset + PLAYER_STATE_SIZE <= buffer.length) {
      const parsedPlayerId = (buffer[offset] << 8) | buffer[offset + 1];
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

      players[parsedPlayerId.toString()] = { position, rotation };
      parsedIds.push(parsedPlayerId);
    }

    // welcome 전이면 버퍼링
    if (!this.playerId && !this.initialStateProcessed) {
      console.log('🧊 Buffered initial snapshot (pre-welcome). players', players);
      this.initialStateBuffered = players;
      console.log('🧊 Buffered initial snapshot (pre-welcome). ids=', parsedIds);
      return;
    }

    // welcome 후 최초 1회면 all-players로 전달(자기 자신 제외)
    if (!this.initialStateProcessed) {
      const filtered: Record<string, PlayerState> = {};
      const selfId = this.playerId?.toString();
      for (const [id, state] of Object.entries(players)) {
        if (id !== selfId) filtered[id] = state;
      }
      console.log('📋 Initial snapshot -> onAllPlayers. self=', selfId, 'ids=', parsedIds);
      this.onInitAll(filtered);
      this.initialStateProcessed = true;
      this.initialStateBuffered = null;
      return;
    }

    // 이후에는 개별 업데이트로 처리(자기 자신 제외)
    const selfId = this.playerId?.toString();
    for (const [id, state] of Object.entries(players)) {
      if (id !== selfId) this.onUpdate(id, state);
    }
  }

  private readFloatBE(buffer: Uint8Array, offset: number): number {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    return view.getFloat32(0, false); // big-endian
  }

  private flushInitialSnapshot() {
    if (this.initialStateProcessed) return;
    const buffered = this.initialStateBuffered || {};
    const filtered: Record<string, PlayerState> = {};
    const selfId = this.playerId?.toString();
    console.log('🧊 Flushing buffered initial snapshot. buffered=', buffered);
    
    for (const [id, state] of Object.entries(buffered)) {
      console.log('🧊 Flushing buffered initial snapshot. id=', id, 'state=', state);
      if (id !== selfId) filtered[id] = state;
    }
    console.log('📋 Flushing buffered initial snapshot. self=', selfId, 'count=', Object.keys(filtered).length);
    this.onInitAll(filtered);
    this.initialStateProcessed = true;
    this.initialStateBuffered = null;
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
    this.consecutivePingFailures = 0; // keep-alive 중단 시 카운터 리셋
  }

  private resetKeepAliveTimeout() {
    if (this.keepAliveTimeout) {
      clearTimeout(this.keepAliveTimeout);
    }
    
    this.keepAliveTimeout = setTimeout(() => {
      this.consecutivePingFailures++;
      console.log(`⏰ Keep-alive timeout (${this.consecutivePingFailures}/${this.maxConsecutivePingFailures})`);
      
      if (this.consecutivePingFailures >= this.maxConsecutivePingFailures) {
        console.log('❌ Too many consecutive ping failures - reconnecting');
        this.consecutivePingFailures = 0; // 리셋
        this.reconnect();
      } else {
        console.log('⏳ Waiting for next ping cycle...');
      }
    }, this.keepAliveTimeoutMs) as any;
  }

  private reconnect() {
    console.log('🔄 Attempting to reconnect...');
    if (this.socket) {
      // Detach handlers so closing the stale socket doesn't trigger a second
      // reconnect via onclose → scheduleReconnect(). connect() below is the
      // single reconnection path.
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close(1000, 'reconnect');
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
    // console.log('socket-manager-sendMovementEvent', event);
    
    // Send only movement event - server handles state updates internally
    this.socket.send(JSON.stringify({ 
      type: 'movement',
      event,
      playerId: this.playerId
    }));
  }

  public sendHit(victimId: number, damage: number, position: number[], distance: number) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.log('❌ Cannot send hit: socket not connected');
      return;
    }

    const hitData = {
      type: 'hit',
      victimId: victimId,
      damage: damage,
      position: position,
      distance: distance,
      timestamp: Date.now()
    };

    console.log('🔫 Sending hit event:', hitData);
    this.socket.send(JSON.stringify(hitData));
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

  public getUsername(): string | null {
    return this.username;
  }
}

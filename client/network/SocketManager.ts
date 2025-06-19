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
  private socket: WebSocket;
  private lastSentState: PlayerState | null = null;
  private lastSentMovement: MovementEvent | null = null;
  private readonly stateThreshold = 0.1; // 위치 변화 임계값
  private readonly rotationThreshold = 0.01; // 회전 변화 임계값

  constructor(
    private onJoin: PlayerUpdateCallback,
    private onUpdate: PlayerUpdateCallback,
    private onLeave: PlayerLeaveCallback,
    private onInitAll: (players: Record<string, PlayerState>) => void,
    private onMovement: PlayerMovementCallback
  ) {
    this.socket = new WebSocket('ws://localhost:3000');
    this.bindEvents();
  }

  private bindEvents() {
    this.socket.onopen = () => {
      console.log('✅ Connected to server');
    };

    this.socket.onmessage = (event) => {
      // 서버에서 받은 메시지 처리 (예: JSON 파싱)
      const msg = JSON.parse(event.data);
      console.log('🔌 onmessage', msg);
      switch (msg.type) {
        case 'player-joined':
          console.log('🔌 player-joined', msg.id, msg.state);
          this.onJoin(msg.id, msg.state);
          break;
        case 'player-update':
          console.log('🔌 player-update', msg.id, msg.state);
          this.onUpdate(msg.id, msg.state);
          break;
        case 'player-left':
          console.log('🔌 player-left', msg.id);
          this.onLeave(msg.id);
          break;
        case 'all-players':
          console.log('🔌 all-players', msg.players);
          this.onInitAll(msg.players);
          break;
        case 'player-movement':
          console.log('🔌 player-movement', msg.playerId, msg.event);
          this.onMovement(msg.playerId, msg.event);
          break;
        case 'movement-ack':
          console.log('🔌 movement acknowledged by server');
          break;
      }
    };

    this.socket.onclose = () => {
      console.log('❌ Disconnected from server');
    };
  }

  public sendState(state: PlayerState) {
    // 상태가 실제로 변경되었을 때만 전송
    if (this.hasStateChanged(state)) {
      console.log('🔌 sendState', state);
      this.socket.send(JSON.stringify({ type: 'update', state }));
      this.lastSentState = { ...state };
    }
  }

  public sendMovementEvent(event: MovementEvent) {
    // 움직임 이벤트 전송
    console.log('🔌 sendMovementEvent', event);
    this.socket.send(JSON.stringify({ type: 'movement', event }));
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

  public getSocketId(): string {
    return this.socket.url; // 임시로 URL을 ID로 사용
  }
}

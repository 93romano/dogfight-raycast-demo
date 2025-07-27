import { SocketManager, PlayerState, MovementEvent } from '../../network/SocketManager';

export interface NetworkEventHandlers {
  onPlayerJoin: (id: string, state: PlayerState) => void;
  onPlayerUpdate: (id: string, state: PlayerState) => void;
  onPlayerLeave: (id: string) => void;
  onAllPlayers: (players: Record<string, PlayerState>) => void;
  onPlayerMovement: (id: string, event: MovementEvent) => void;
  onPlayerHit: (attackerId: string, victimId: string, damage: number, victimHealth: number) => void;
  onPlayerDeath: (victimId: string, attackerId: string, respawnPosition: number[]) => void;
}

export class NetworkManager {
  private socket: SocketManager | null = null;
  private handlers: NetworkEventHandlers;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 1초

  constructor(handlers: NetworkEventHandlers) {
    this.handlers = handlers;
  }

  public async connect(username: string): Promise<void> {
    console.log('🔌 Connecting to server with username:', username);
    
    return new Promise((resolve, reject) => {
      this.socket = new SocketManager(
        this.handlers.onPlayerJoin,
        this.handlers.onPlayerUpdate,
        this.handlers.onPlayerLeave,
        (players) => {
          this.handlers.onAllPlayers(players);
          resolve(); // 연결 성공
        },
        this.handlers.onPlayerMovement,
        this.handlers.onPlayerHit,
        this.handlers.onPlayerDeath
      );

      // 연결 성공 감지
      const checkConnection = () => {
        if (this.socket?.isConnected() && this.socket?.getPlayerId()) {
          console.log('🎯 Socket connected successfully with Player ID:', this.socket.getPlayerId());
          this.reconnectAttempts = 0; // 성공 시 재연결 시도 횟수 리셋
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      try {
        this.socket.connectWithUsername(username);
        
        // 연결 확인 시작
        setTimeout(checkConnection, 100);
        
        // 연결 타임아웃 설정
        setTimeout(() => {
          if (!this.socket?.isConnected() || !this.socket?.getPlayerId()) {
            reject(new Error('서버 연결 시간이 초과되었습니다.'));
          }
        }, 10000); // 10초 타임아웃
        
      } catch (error) {
        reject(error);
      }
    });
  }

  public async reconnect(username: string): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error('최대 재연결 시도 횟수를 초과했습니다.');
    }

    this.reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    // 재연결 지연
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay * this.reconnectAttempts));
    
    return this.connect(username);
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public sendState(state: PlayerState): void {
    if (this.socket && this.socket.isConnected()) {
      this.socket.sendState(state);
    } else {
      console.warn('Cannot send state: not connected to server');
    }
  }

  public sendMovementEvent(event: MovementEvent): void {
    if (this.socket && this.socket.isConnected()) {
      this.socket.sendMovementEvent(event);
    } else {
      console.warn('Cannot send movement event: not connected to server');
    }
  }

  public sendHit(targetId: number, damage: number, hitPoint: number[], distance: number): void {
    if (this.socket && this.socket.isConnected()) {
      this.socket.sendHit(targetId, damage, hitPoint, distance);
    } else {
      console.warn('Cannot send hit event: not connected to server');
    }
  }

  public isConnected(): boolean {
    return this.socket?.isConnected() ?? false;
  }

  public getPlayerId(): number | null {
    return this.socket?.getPlayerId() ?? null;
  }

  public getSocketId(): string | null {
    return this.socket?.getSocketId() ?? null;
  }
}



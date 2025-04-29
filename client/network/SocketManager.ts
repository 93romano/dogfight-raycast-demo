// client/network/SocketManager.ts

import { io, Socket } from 'socket.io-client';

export interface PlayerState {
  position: number[]; // [x, y, z]
  rotation: number[]; // [x, y, z, w] quaternion
}

export type PlayerUpdateCallback = (id: string, state: PlayerState) => void;
export type PlayerLeaveCallback = (id: string) => void;

export class SocketManager {
  private socket: Socket;

  constructor(
    private onJoin: PlayerUpdateCallback,
    private onUpdate: PlayerUpdateCallback,
    private onLeave: PlayerLeaveCallback,
    private onInitAll: (players: Record<string, PlayerState>) => void
  ) {
    this.socket = io('http://localhost:3000');
    this.bindEvents();
  }

  private bindEvents() {
    this.socket.on('connect', () => {
      console.log('✅ Connected to server:', this.socket.id);
    });

    this.socket.on('player-joined', ({ id, state }) => {
      this.onJoin(id, state);
    });

    this.socket.on('player-update', ({ id, state }) => {
      this.onUpdate(id, state);
    });

    this.socket.on('player-left', (id) => {
      this.onLeave(id);
    });

    this.socket.on('all-players', (players) => {
      this.onInitAll(players);
    });
  }

  public sendState(state: PlayerState) {
    this.socket.emit('update', state);
  }

  public getSocketId(): string {
    return this.socket.id;
  }
}

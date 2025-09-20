// server/game/GameState.js

export class GameState {
  constructor() {
    this.players = new Map();
    this.currentMatchId = null;
    this.playerUserMap = new Map(); // playerId -> userId 매핑
    this.lastUpdate = Date.now();
    this.tickRate = 60;
    this.tickInterval = 1000 / 60;
    this.lastLogTime = null;
  }

  addPlayer(playerId, playerData) {
    this.players.set(playerId, {
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
      // 체력 시스템
      health: 100,
      maxHealth: 100,
      lastShotTime: 0,
      shotCooldown: 500, // 0.5초
      ...playerData
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.playerUserMap.delete(playerId);
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getAllPlayers() {
    return this.players;
  }

  updatePlayerState(playerId, state) {
    const player = this.players.get(playerId);
    if (player) {
      Object.assign(player, state);
    }
  }

  updatePlayerPosition(playerId, position, rotation) {
    const player = this.players.get(playerId);
    if (player) {
      player.position = position;
      player.rotation = rotation;
      player.lastActivity = Date.now();
    }
  }

  updatePlayerInput(playerId, inputState, speed) {
    const player = this.players.get(playerId);
    if (player) {
      player.inputState = inputState;
      player.speed = speed || 0;
      player.lastActivity = Date.now();
    }
  }

  setCurrentMatch(matchId) {
    this.currentMatchId = matchId;
  }

  getCurrentMatch() {
    return this.currentMatchId;
  }

  mapPlayerToUser(playerId, userId) {
    this.playerUserMap.set(playerId, userId);
  }

  getUserForPlayer(playerId) {
    return this.playerUserMap.get(playerId);
  }

  clear() {
    this.players.clear();
    this.playerUserMap.clear();
    this.currentMatchId = null;
  }
}

export default GameState; 
// server/services/MatchManager.js
import GameEventService from './GameEventService.js';

export class MatchManager {
  constructor(gameState, webSocketManager) {
    this.gameState = gameState;
    this.webSocketManager = webSocketManager;
  }

  async startMatch() {
    try {
      const matchId = await GameEventService.createMatch();
      this.gameState.setCurrentMatch(matchId);
      console.log(`🎮 New match started with ID: ${matchId}`);
      
      // 브로드캐스트 매치 시작
      const matchStartMessage = JSON.stringify({
        type: 'match-started',
        matchId: matchId,
        timestamp: Date.now()
      });
      
      this.webSocketManager.broadcast(matchStartMessage);
      
      return matchId;
    } catch (error) {
      console.error('Error starting match:', error);
      return null;
    }
  }

  async endMatch() {
    const matchId = this.gameState.getCurrentMatch();
    if (!matchId) return;
    
    try {
      await GameEventService.endMatch(matchId);
      console.log(`🏁 Match ${matchId} ended`);
      
      // 브로드캐스트 매치 종료
      const matchEndMessage = JSON.stringify({
        type: 'match-ended',
        matchId: matchId,
        timestamp: Date.now()
      });
      
      this.webSocketManager.broadcast(matchEndMessage);
      
      this.gameState.clear();
    } catch (error) {
      console.error('Error ending match:', error);
    }
  }

  async addPlayerToMatch(userId) {
    let matchId = this.gameState.getCurrentMatch();
    
    // 매치가 없으면 새로 시작
    if (!matchId) {
      matchId = await this.startMatch();
    }

    if (matchId) {
      try {
        await GameEventService.addPlayerToMatch(matchId, userId);
        console.log(`👤 User ${userId} added to match ${matchId}`);
        return matchId;
      } catch (error) {
        console.error('Error adding player to match:', error);
        return null;
      }
    }

    return null;
  }

  async removePlayerFromMatch(playerId, userId) {
    const matchId = this.gameState.getCurrentMatch();
    if (!matchId) return;

    try {
      // GameEventService에서 플레이어 제거 로직이 있다면 호출
      console.log(`👤 User ${userId} (Player ${playerId}) removed from match ${matchId}`);
      
      // 플레이어가 모두 나가면 매치 종료
      if (this.gameState.getPlayerCount() === 0) {
        await this.endMatch();
      }
    } catch (error) {
      console.error('Error removing player from match:', error);
    }
  }

  getCurrentMatchId() {
    return this.gameState.getCurrentMatch();
  }

  isMatchActive() {
    return this.gameState.getCurrentMatch() !== null;
  }
}

export default MatchManager; 
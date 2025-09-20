// server/utils/Debug.js

export class Debug {
  static createDebugHelpers(redisManager, gameState, connectionManager) {
    return {
      // 연결된 플레이어 목록 조회
      async getActivePlayers() {
        try {
          const redisPlayers = await redisManager.getActivePlayers();
          const gameStatePlayers = Array.from(gameState.getAllPlayers().keys());
          const connections = connectionManager.getActiveConnectionCount();
          
          console.log('🔍 Active Players Debug Info:');
          console.log(`   Redis: ${redisPlayers.length} players`);
          console.log(`   GameState: ${gameStatePlayers.length} players`);
          console.log(`   Connections: ${connections} active`);
          console.table(redisPlayers);
          
          return {
            redis: redisPlayers,
            gameState: gameStatePlayers,
            connections: connections
          };
        } catch (error) {
          console.error('Error getting active players:', error);
        }
      },

      // 게임 상태 조회
      getGameState() {
        const debugInfo = gameState.getDebugInfo();
        console.log('🎮 Game State Debug Info:');
        console.table(debugInfo);
        return debugInfo;
      },

      // 연결 통계 조회
      getConnectionStats() {
        const stats = connectionManager.getConnectionStats();
        console.log('🔗 Connection Stats:');
        console.table(stats);
        return stats;
      },

      // 특정 플레이어 상태 조회
      getPlayerState(playerId) {
        const player = gameState.getPlayer(playerId);
        const connection = connectionManager.getConnection(playerId);
        
        const result = {
          gameState: player,
          connection: connection ? {
            userId: connection.userId,
            username: connection.username,
            lastActivity: new Date(connection.lastActivity),
            connectedAt: new Date(connection.connectedAt)
          } : null
        };
        
        console.log(`🔍 Player ${playerId} Debug Info:`, result);
        return result;
      },

      // 매치 정보 조회
      getMatchInfo() {
        const matchInfo = {
          currentMatch: gameState.getCurrentMatch(),
          playerCount: gameState.getPlayerCount(),
          players: Array.from(gameState.getAllPlayers().keys())
        };
        
        console.log('🎯 Match Debug Info:');
        console.table(matchInfo);
        return matchInfo;
      },

      // 전체 시스템 상태 조회
      async getSystemStatus() {
        try {
          const [redisPlayers, gameDebug, connStats] = await Promise.all([
            redisManager.getActivePlayers(),
            gameState.getDebugInfo(),
            connectionManager.getConnectionStats()
          ]);
          
          const systemStatus = {
            timestamp: new Date().toISOString(),
            redis: {
              activePlayers: redisPlayers.length
            },
            gameState: gameDebug,
            connections: connStats,
            match: {
              active: gameState.getCurrentMatch() !== null,
              id: gameState.getCurrentMatch()
            }
          };
          
          console.log('📊 System Status:');
          console.log(JSON.stringify(systemStatus, null, 2));
          return systemStatus;
        } catch (error) {
          console.error('Error getting system status:', error);
        }
      }
    };
  }
}

export default Debug;
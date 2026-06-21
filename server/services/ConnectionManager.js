// server/services/ConnectionManager.js

export class ConnectionManager {
  constructor() {
    this.activeConnections = new Map(); // playerId -> { ws, lastActivity, userId, username }
    this.inactiveTimeout = Number(process.env.INACTIVE_TIMEOUT_MS) || 120000; // 2분
    this.inactiveCheckMs = Number(process.env.INACTIVE_CHECK_MS) || 30000;

    // 비활성 플레이어를 완전히 정리하기 위한 콜백 (index.js에서 cleanupPlayer 주입)
    this.onInactiveDisconnect = null;

    // 주기적으로 비활성 사용자 체크
    this.inactiveCheckInterval = setInterval(() => this.checkInactiveUsers(), this.inactiveCheckMs);
  }

  addConnection(playerId, ws, userId, username) {
    this.activeConnections.set(playerId, {
      ws: ws,
      userId: userId,
      username: username,
      lastActivity: Date.now(),
      connectedAt: Date.now()
    });
    
    console.log(`🔗 Connection added: Player ${playerId} (${username})`);
  }

  removeConnection(playerId) {
    const connection = this.activeConnections.get(playerId);
    if (connection) {
      this.activeConnections.delete(playerId);
      console.log(`🔗 Connection removed: Player ${playerId} (${connection.username})`);
      return connection;
    }
    return null;
  }

  updateActivity(playerId) {
    const connection = this.activeConnections.get(playerId);
    if (connection) {
      connection.lastActivity = Date.now();
      return true;
    }
    return false;
  }

  getConnection(playerId) {
    return this.activeConnections.get(playerId);
  }

  getAllConnections() {
    return this.activeConnections;
  }

  checkInactiveUsers() {
    const now = Date.now();
    const inactiveUsers = [];
    
    for (const [playerId, connection] of this.activeConnections) {
      const inactiveTime = now - connection.lastActivity;
      
      if (inactiveTime > this.inactiveTimeout) {
        console.log(`⏰ Player ${playerId} (${connection.username}) inactive for ${Math.round(inactiveTime / 1000)}s - disconnecting`);

        // 소켓이 살아있으면 정상 종료 시도
        if (connection.ws && connection.ws.readyState === 1) { // WebSocket.OPEN
          connection.ws.close(1000, 'Inactive timeout');
        }

        // 'close' 이벤트에만 의존하지 않고 전체 정리를 직접 호출한다.
        // (죽은 소켓은 'close'를 발생시키지 않아 gameState에 유령 플레이어가 남는다)
        // cleanupPlayer는 멱등하므로 이후 'close'가 발생해도 중복 정리는 no-op이다.
        if (this.onInactiveDisconnect) {
          Promise.resolve(this.onInactiveDisconnect(playerId, connection.userId))
            .catch((err) => console.error(`Error during inactive cleanup for Player ${playerId}:`, err));
        }

        inactiveUsers.push(playerId);
      }
    }
    
    // 정리 (close 이벤트에서도 처리되지만 안전장치)
    inactiveUsers.forEach(playerId => {
      this.activeConnections.delete(playerId);
    });
    
    if (inactiveUsers.length > 0) {
      console.log(`🧹 Cleaned up ${inactiveUsers.length} inactive connections`);
    }
  }

  getActiveConnectionCount() {
    return this.activeConnections.size;
  }

  getConnectionStats() {
    const now = Date.now();
    const connections = Array.from(this.activeConnections.values());
    
    return {
      totalConnections: connections.length,
      averageConnectionTime: connections.length > 0 
        ? connections.reduce((sum, conn) => sum + (now - conn.connectedAt), 0) / connections.length
        : 0,
      oldestConnection: connections.length > 0 
        ? Math.min(...connections.map(conn => conn.connectedAt))
        : null
    };
  }

  cleanup() {
    if (this.inactiveCheckInterval) {
      clearInterval(this.inactiveCheckInterval);
      this.inactiveCheckInterval = null;
    }
    
    // 모든 연결 강제 종료
    for (const [playerId, connection] of this.activeConnections) {
      if (connection.ws && connection.ws.readyState === 1) {
        connection.ws.close(1000, 'Server shutdown');
      }
    }
    
    this.activeConnections.clear();
    console.log('🧹 ConnectionManager cleaned up');
  }
}

export default ConnectionManager; 
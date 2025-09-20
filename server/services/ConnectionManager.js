// server/services/ConnectionManager.js

export class ConnectionManager {
  constructor() {
    this.activeConnections = new Map(); // playerId -> { ws, lastActivity, userId, username }
    this.inactiveTimeout = 120000; // 2분
    
    // 30초마다 비활성 사용자 체크
    this.inactiveCheckInterval = setInterval(() => this.checkInactiveUsers(), 30000);
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
        
        // 연결 강제 종료
        if (connection.ws && connection.ws.readyState === 1) { // WebSocket.OPEN
          connection.ws.close(1000, 'Inactive timeout');
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
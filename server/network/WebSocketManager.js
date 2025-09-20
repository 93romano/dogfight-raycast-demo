 // server/network/WebSocketManager.js

export class WebSocketManager {
    constructor(wss) {
      this.wss = wss;
    }
  
    broadcast(message, excludeWs = null) {
      let sentCount = 0;
      
      this.wss.clients.forEach(client => {
        if (client.readyState === 1 && client !== excludeWs) { // WebSocket.OPEN
          client.send(message);
          sentCount++;
        }
      });
      
      return sentCount;
    }
  
    broadcastToPlayers(message, playerIds, gameState) {
      let sentCount = 0;
      
      this.wss.clients.forEach(client => {
        if (client.readyState === 1 && client.playerId && playerIds.includes(client.playerId)) {
          client.send(message);
          sentCount++;
        }
      });
      
      return sentCount;
    }
  
    sendToPlayer(playerId, message) {
      for (const client of this.wss.clients) {
        if (client.readyState === 1 && client.playerId === playerId) {
          client.send(message);
          return true;
        }
      }
      return false;
    }
  
    getClientCount() {
      return this.wss.clients.size;
    }
  
    getActiveClientCount() {
      let count = 0;
      this.wss.clients.forEach(client => {
        if (client.readyState === 1) {
          count++;
        }
      });
      return count;
    }
  
    forceDisconnectByWsId(wsId, reason = 'Forced disconnect') {
      for (const client of this.wss.clients) {
        if (client.wsId === wsId) {
          console.log(`🔌 Force disconnecting client with wsId: ${wsId}`);
          client.close(1000, reason);
          return true;
        }
      }
      return false;
    }
  
    getClientStats() {
      const clients = Array.from(this.wss.clients);
      const activeClients = clients.filter(client => client.readyState === 1);
      
      return {
        total: clients.length,
        active: activeClients.length,
        withPlayerId: activeClients.filter(client => client.playerId).length
      };
    }
  }
  
  export default WebSocketManager;
// server/handlers/MessageHandler.js
import { redisClient } from '../config/database.js';

export class MessageHandler {
  constructor(gameState, combatSystem, webSocketManager, redisManager) {
    this.gameState = gameState;
    this.combatSystem = combatSystem;
    this.webSocketManager = webSocketManager;
    this.redisManager = redisManager;
  }

  async handleMovementEvent(playerId, event, ws) {
    const player = this.gameState.getPlayer(playerId);
    if (!player) {
      console.log(`⚠️ Player ${playerId} not found for movement event`);
      return;
    }

    // 입력 데이터 검증
    if (!event.input) {
      return;
    }

    // 입력 상태 업데이트 - 안전한 접근
    const inputState = {
      forward: Boolean(event.input.forward),
      backward: Boolean(event.input.backward),
      left: Boolean(event.input.left),
      right: Boolean(event.input.right),
      up: Boolean(event.input.up),
      down: Boolean(event.input.down),
      roll: Number(event.input.roll) || 0
    };

    // 게임 상태 업데이트
    this.gameState.updatePlayerInput(playerId, inputState, event.speed);

    // 위치와 회전 업데이트 - 안전한 접근
    if (event.position && Array.isArray(event.position) && 
        event.rotation && Array.isArray(event.rotation)) {
      this.gameState.updatePlayerPosition(playerId, event.position, event.rotation);
    }

    // Redis에 플레이어 상태 저장 (논블로킹)
    try {
      await redisClient.hmset(`player:${playerId}:state`, {
        position: JSON.stringify(player.position),
        rotation: JSON.stringify(player.rotation),
        health: player.health,
        speed: player.speed,
        lastUpdate: Date.now()
      });
      await redisClient.expire(`player:${playerId}:state`, 600); // 10분 TTL
    } catch (error) {
      console.error('Error saving player state to Redis:', error);
    }

    // 다른 플레이어들에게 움직임 이벤트 브로드캐스트
    const movementMessage = JSON.stringify({
      type: 'player-movement',
      playerId: playerId,
      event: event
    });

    const broadcastCount = this.webSocketManager.broadcast(movementMessage, ws);

    // 움직임 확인 응답
    ws.send(JSON.stringify({
      type: 'movement-ack',
      timestamp: Date.now()
    }));
  }

  async handleMessage(ws, message) {
    try {
      const playerId = ws.playerId;
      const userId = ws.userId;

      // ping 메시지는 JSON이 아닐 수 있으므로 먼저 확인
      if (message.toString() === 'ping') {
        ws.send('pong');
        return;
      }
      
      const data = JSON.parse(message);
      console.log(`🎮 Player ${playerId} sent: ${data.type}`);
      
      switch (data.type) {
        case 'movement':
          await this.handleMovementEvent(playerId, data, ws);
          break;
          
        case 'hit':
          if (data.victimId && data.victimId !== playerId) {
            await this.combatSystem.handlePlayerHit(
              playerId, 
              data.victimId, 
              data.damage, 
              data.position, 
              data.distance
            );
          }
          break;
          
        case 'kill':
          if (data.victimId && data.victimId !== playerId) {
            await this.combatSystem.handlePlayerKill(playerId, data.victimId, data.damage);
          }
          break;
          
        case 'damage':
          if (data.victimId && data.victimId !== playerId) {
            await this.combatSystem.handlePlayerDamage(playerId, data.victimId, data.damage);
          }
          break;
          
        case 'update':
          if (data.state && data.state.position && data.state.rotation) {
            const player = this.gameState.getPlayer(playerId);
            if (player) {
              // 플레이어 상태 업데이트
              this.gameState.updatePlayerPosition(playerId, data.state.position, data.state.rotation);
              
              // 다른 플레이어들에게 브로드캐스트
              const updateMessage = JSON.stringify({
                type: 'player-update',
                id: playerId.toString(),
                state: data.state
              });
              
              this.webSocketManager.broadcast(updateMessage, ws);
            }
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          break;
          
        case 'get-stats':
          await this.handleGetStats(ws);
          break;
          
        case 'get-rankings':
          await this.handleGetRankings(ws);
          break;

        default:
          console.log(`❓ Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  async handleGetStats(ws) {
    try {
      const matchId = this.gameState.getCurrentMatch();
      if (matchId) {
        const GameEventService = (await import('../services/GameEventService.js')).default;
        const stats = await GameEventService.getMatchPlayerStats(matchId);
        ws.send(JSON.stringify({
          type: 'match-stats',
          stats: stats
        }));
      }
    } catch (error) {
      console.error('Error getting stats:', error);
    }
  }

  async handleGetRankings(ws) {
    try {
      const GameEventService = (await import('../services/GameEventService.js')).default;
      const rankings = await GameEventService.getGlobalRankings();
      ws.send(JSON.stringify({
        type: 'global-rankings',
        rankings: rankings
      }));
    } catch (error) {
      console.error('Error getting rankings:', error);
    }
  }
}

export default MessageHandler; 
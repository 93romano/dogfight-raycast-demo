// server/services/RedisManager.js
import { redisClient, redisPubSub } from '../config/database.js';

export class RedisManager {
  constructor(serverId) {
    this.serverId = serverId;
    this.subscriber = redisClient.duplicate();
    this.initSubscriber();
  }

  // 연결 상태 관리
  async setPlayerConnectionState(playerId, userId, username, matchId, wsId) {
    try {
      const now = Date.now();
      await Promise.all([
        // 연결 정보
        redisClient.hmset(`connection:${playerId}`, {
          wsId,
          serverId: this.serverId,
          timestamp: now
        }),
        redisClient.expire(`connection:${playerId}`, 120), // 2분 TTL
        
        // 유저 세션
        redisClient.hmset(`user:${userId}:session`, {
          playerId,
          username,
          matchId: matchId || '',
          serverId: this.serverId,
          connectedAt: now,
          lastActivity: now,
          status: 'connected'
        }),
        redisClient.expire(`user:${userId}:session`, 300), // 5분 TTL
        
        // 매치 플레이어 목록 추가 (매치가 있는 경우만)
        matchId ? redisClient.sadd(`match:${matchId}:players`, playerId) : Promise.resolve(),
        matchId ? redisClient.expire(`match:${matchId}:players`, 3600) : Promise.resolve() // 1시간 TTL
      ]);
      
      console.log(`🔗 Redis connection state set for Player ${playerId} with wsId: ${wsId}`);
    } catch (error) {
      console.error('Error setting Redis connection state:', error);
    }
  }

  async updatePlayerActivity(playerId, userId) {
    try {
      const now = Date.now();
      await Promise.all([
        redisClient.hset(`user:${userId}:session`, 'lastActivity', now),
        redisClient.expire(`user:${userId}:session`, 300),
        redisClient.expire(`connection:${playerId}`, 120)
      ]);
    } catch (error) {
      console.error('Error updating player activity:', error);
    }
  }

  async clearPlayerConnectionState(playerId, userId, matchId) {
    try {
      await Promise.all([
        redisClient.del(`connection:${playerId}`),
        redisClient.hset(`user:${userId}:session`, 'status', 'disconnected'),
        matchId ? redisClient.srem(`match:${matchId}:players`, playerId) : Promise.resolve(),
        redisClient.del(`player:${playerId}:state`)
      ]);
      
      console.log(`🧹 Redis connection state cleared for Player ${playerId}`);
    } catch (error) {
      console.error('Error clearing Redis connection state:', error);
    }
  }

  async forceDisconnectPlayer(playerId, oldWsId, reason) {
    try {
      // Redis Pub/Sub로 강제 연결 해제 요청
      await redisPubSub.publish('force_disconnect', JSON.stringify({
        playerId,
        oldWsId,
        serverId: this.serverId,
        reason
      }));
      
      console.log(`📡 Published force disconnect for Player ${playerId}, wsId: ${oldWsId}`);
    } catch (error) {
      console.error('Error publishing force disconnect:', error);
    }
  }

  initSubscriber() {
    this.subscriber.subscribe('force_disconnect');
    
    this.subscriber.on('message', (channel, message) => {
      if (channel === 'force_disconnect') {
        this.handleForceDisconnect(message);
      }
    });
  }

  handleForceDisconnect(message) {
    try {
      const { playerId, oldWsId, serverId, reason } = JSON.parse(message);
      
      // 이벤트 발생으로 WebSocketManager에서 처리하도록 함
      this.emit('forceDisconnect', { playerId, oldWsId, serverId, reason });
    } catch (error) {
      console.error('Error processing force disconnect message:', error);
    }
  }

  async cleanupPreviousConnections() {
    try {
      console.log('🧹 Cleaning up previous connections...');
      
      const keys = await redisClient.keys('user:*:session');
      let cleanupCount = 0;
      
      for (const key of keys) {
        const session = await redisClient.hgetall(key);
        if (session.status === 'connected' && session.serverId === this.serverId) {
          // 같은 서버에서 시작된 세션들을 disconnected로 마킹
          await redisClient.hset(key, 'status', 'disconnected');
          cleanupCount++;
        }
      }
      
      // 이전 연결 상태들 정리
      const connectionKeys = await redisClient.keys('connection:*');
      for (const key of connectionKeys) {
        const connection = await redisClient.hgetall(key);
        if (connection.serverId === this.serverId) {
          await redisClient.del(key);
        }
      }
      
      console.log(`✅ Cleaned up ${cleanupCount} previous sessions and ${connectionKeys.length} connections`);
    } catch (error) {
      console.error('Error cleaning up previous connections:', error);
    }
  }

  // 개발용 디버그 함수들
  async getActivePlayers() {
    try {
      const keys = await redisClient.keys('user:*:session');
      const results = [];
      
      for (const key of keys) {
        const session = await redisClient.hgetall(key);
        if (session.status === 'connected') {
          results.push({
            userId: key.split(':')[1],
            playerId: session.playerId,
            username: session.username,
            matchId: session.matchId,
            serverId: session.serverId,
            connectedAt: new Date(parseInt(session.connectedAt))
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error getting active players:', error);
      return [];
    }
  }

  async cleanup() {
    await this.subscriber.quit();
  }
}

export default RedisManager; 
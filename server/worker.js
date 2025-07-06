import { redisClient, pgPool } from './config/database.js';

class GameEventWorker {
  constructor() {
    this.BATCH_SIZE = 100;
    this.CONSUMER_GROUP = 'game_events_group';
    this.CONSUMER_NAME = 'worker_1';
    this.STREAM_KEY = 'game_events';
    this.isRunning = false;
  }

  async initialize() {
    try {
      // Consumer 그룹 생성 (이미 존재하는 경우 무시)
      await redisClient.xgroup('CREATE', this.STREAM_KEY, this.CONSUMER_GROUP, '0', 'MKSTREAM')
        .catch(() => console.log('Consumer group already exists'));
      
      console.log('Worker initialized successfully');
      this.isRunning = true;
      this.startProcessing();
    } catch (error) {
      console.error('Worker initialization failed:', error);
      process.exit(1);
    }
  }

  async startProcessing() {
    while (this.isRunning) {
      try {
        // Stream에서 새로운 이벤트 읽기
        const response = await redisClient.xreadgroup(
          'GROUP', this.CONSUMER_GROUP, this.CONSUMER_NAME,
          'COUNT', this.BATCH_SIZE,
          'BLOCK', 2000,
          'STREAMS', this.STREAM_KEY, '>'
        );

        if (response) {
          const [streamEvents] = response;
          const [, events] = streamEvents;

          if (events.length > 0) {
            await this.processBatch(events);
          }
        }
      } catch (error) {
        console.error('Error processing events:', error);
        await this.sleep(1000);
      }
    }
  }

  async processBatch(events) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      const processedEvents = [];
      
      for (const [eventId, fields] of events) {
        try {
          // Redis Stream 데이터를 객체로 변환
          const eventData = {};
          for (let i = 0; i < fields.length; i += 2) {
            eventData[fields[i]] = fields[i + 1];
          }

          // 필수 필드 검증
          if (!eventData.event_id || !eventData.event_type || !eventData.match_id ||
              !eventData.attacker_id || !eventData.victim_id || !eventData.damage) {
            console.warn('Skipping event with missing required fields:', eventId);
            continue;
          }

          // hit_log 테이블에 이벤트 저장
          await client.query(`
            INSERT INTO hit_log (
              event_id, event_type, match_id, attacker_id, 
              victim_id, damage, raw_payload, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (event_id) DO NOTHING
          `, [
            eventData.event_id,
            eventData.event_type,
            parseInt(eventData.match_id),
            parseInt(eventData.attacker_id),
            parseInt(eventData.victim_id),
            parseInt(eventData.damage),
            eventData.raw_payload
          ]);

          processedEvents.push(eventId);
        } catch (error) {
          console.error('Error processing individual event:', eventId, error);
          // 개별 이벤트 에러는 로그만 남기고 계속 진행
        }
      }

      await client.query('COMMIT');
      
      // 처리된 이벤트들만 ACK
      for (const eventId of processedEvents) {
        await redisClient.xack(this.STREAM_KEY, this.CONSUMER_GROUP, eventId);
      }

      console.log(`Processed ${processedEvents.length} events successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing batch:', error);
    } finally {
      client.release();
    }
  }

  // 주기적인 통계 업데이트 (별도 메서드)
  async updateRankings() {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      // 완료된 매치들의 통계를 rankings 테이블에 업데이트
      await client.query(`
        INSERT INTO rankings (user_id, total_kills, total_deaths, total_score)
        SELECT 
          mp.user_id,
          SUM(mp.kills) as total_kills,
          SUM(mp.deaths) as total_deaths,
          SUM(mp.score) as total_score
        FROM match_players mp
        JOIN matches m ON mp.match_id = m.id
        WHERE m.end_time IS NOT NULL
        GROUP BY mp.user_id
        ON CONFLICT (user_id) DO UPDATE SET
          total_kills = EXCLUDED.total_kills,
          total_deaths = EXCLUDED.total_deaths,
          total_score = EXCLUDED.total_score
      `);

      await client.query('COMMIT');
      console.log('Rankings updated successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating rankings:', error);
    } finally {
      client.release();
    }
  }

  // 오래된 이벤트 정리
  async cleanupOldEvents() {
    try {
      // 7일 이상 된 이벤트 삭제
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      const result = await pgPool.query(`
        DELETE FROM hit_log 
        WHERE created_at < $1
      `, [cutoffDate]);

      console.log(`Cleaned up ${result.rowCount} old events`);
    } catch (error) {
      console.error('Error cleaning up old events:', error);
    }
  }

  // 주기적인 유지보수 작업
  startMaintenanceTasks() {
    // 1시간마다 랭킹 업데이트
    setInterval(() => {
      this.updateRankings();
    }, 60 * 60 * 1000);

    // 매일 자정에 오래된 이벤트 정리
    setInterval(() => {
      this.cleanupOldEvents();
    }, 24 * 60 * 60 * 1000);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async shutdown() {
    console.log('Shutting down worker...');
    this.isRunning = false;
    
    // 진행 중인 작업 완료 대기
    await this.sleep(3000);
    
    // Redis 연결 종료
    await redisClient.quit();
    
    // PostgreSQL 연결 종료
    await pgPool.end();
    
    console.log('Worker shutdown complete');
  }
}

// 신호 처리
const worker = new GameEventWorker();

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  worker.shutdown().then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  worker.shutdown().then(() => {
    process.exit(0);
  });
});

// 워커 시작
worker.initialize().then(() => {
  worker.startMaintenanceTasks();
}).catch(console.error); 
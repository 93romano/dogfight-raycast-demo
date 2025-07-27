import { v4 as uuidv4 } from 'uuid';
import { pgPool } from '../config/database.js';
// import { redisClient, pgPool } from '../config/database.js';

class GameEventService {
  // 유저 생성 또는 가져오기
  async createOrGetUser(username) {
    const client = await pgPool.connect();
    try {
      // 유저 존재 확인
      let result = await client.query('SELECT id FROM users WHERE username = $1', [username]);
      
      if (result.rows.length === 0) {
        // 유저 생성
        result = await client.query(
          'INSERT INTO users (username) VALUES ($1) RETURNING id',
          [username]
        );
      }
      
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  // 새로운 매치 생성
  async createMatch() {
    const result = await pgPool.query(
      'INSERT INTO matches (start_time) VALUES (NOW()) RETURNING id'
    );
    return result.rows[0].id;
  }

  // 매치에 플레이어 추가
  async addPlayerToMatch(matchId, userId, team = null) {
    await pgPool.query(
      'INSERT INTO match_players (match_id, user_id, team) VALUES ($1, $2, $3)',
      [matchId, userId, team]
    );
  }

  // 히트 이벤트 처리 및 Redis Stream에 저장 (주석처리)
  async processHitEvent(eventData) {
    const eventId = uuidv4();
    const { matchId, attackerId, victimId, damage, eventType } = eventData;

    // Redis Stream에 이벤트 추가 (주석처리)
    /*
    await redisClient.xadd(
      'game_events',
      '*',
      'event_id', eventId,
      'event_type', eventType,
      'match_id', matchId,
      'attacker_id', attackerId,
      'victim_id', victimId,
      'damage', damage,
      'raw_payload', JSON.stringify(eventData)
    );

    // 즉시 브로드캐스트 (Redis Pub/Sub 사용)
    await redisClient.publish('game_events_broadcast', JSON.stringify({
      type: eventType,
      matchId,
      attackerId,
      victimId,
      damage,
      eventId
    }));
    */

    console.log(`🎯 Hit event processed: ${eventType} - ${attackerId} -> ${victimId} (${damage} damage)`);
    return eventId;
  }

  // 매치 종료 처리
  async endMatch(matchId) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      // 매치 종료 시간 업데이트
      await client.query(
        'UPDATE matches SET end_time = NOW() WHERE id = $1',
        [matchId]
      );

      // 유저별 누적 통계 업데이트 (같은 유저의 중복 엔트리들을 합계로 처리)
      await client.query(`
        INSERT INTO rankings (user_id, total_kills, total_deaths, total_score)
        SELECT 
          mp.user_id,
          SUM(mp.kills) as total_kills,
          SUM(mp.deaths) as total_deaths,
          SUM(mp.score) as total_score
        FROM match_players mp
        WHERE mp.match_id = $1
        GROUP BY mp.user_id
        ON CONFLICT (user_id) DO UPDATE SET
          total_kills = rankings.total_kills + EXCLUDED.total_kills,
          total_deaths = rankings.total_deaths + EXCLUDED.total_deaths,
          total_score = rankings.total_score + EXCLUDED.total_score
      `, [matchId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // 플레이어 점수 업데이트
  async updatePlayerScore(matchId, userId, score, kills, deaths) {
    await pgPool.query(`
      UPDATE match_players 
      SET score = $1, kills = $2, deaths = $3
      WHERE match_id = $4 AND user_id = $5
    `, [score, kills, deaths, matchId, userId]);
  }

  // 매치별 플레이어 통계 조회
  async getMatchPlayerStats(matchId) {
    const result = await pgPool.query(`
      SELECT 
        mp.*,
        u.username
      FROM match_players mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.match_id = $1
    `, [matchId]);
    
    return result.rows;
  }

  // 전체 랭킹 조회
  async getGlobalRankings(limit = 10) {
    const result = await pgPool.query(`
      SELECT 
        r.*,
        u.username,
        CASE 
          WHEN r.total_deaths = 0 THEN r.total_kills
          ELSE ROUND(r.total_kills::numeric / r.total_deaths, 2)
        END as kd_ratio
      FROM rankings r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.total_score DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }

  // 매치 히트 로그 조회
  async getMatchHitLog(matchId) {
    const result = await pgPool.query(`
      SELECT 
        hl.*,
        u_attacker.username as attacker_username,
        u_victim.username as victim_username
      FROM hit_log hl
      JOIN users u_attacker ON hl.attacker_id = u_attacker.id
      JOIN users u_victim ON hl.victim_id = u_victim.id
      WHERE hl.match_id = $1
      ORDER BY hl.created_at DESC
    `, [matchId]);
    
    return result.rows;
  }

  // 플레이어 킬 이벤트 처리
  async handlePlayerKill(matchId, attackerId, victimId, damage = 100) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      // 킬 이벤트 처리
      await this.processHitEvent({
        matchId,
        attackerId,
        victimId,
        damage,
        eventType: 'kill'
      });

      // 즉시 플레이어 통계 업데이트
      await client.query(`
        UPDATE match_players 
        SET kills = kills + 1, score = score + 100
        WHERE match_id = $1 AND user_id = $2
      `, [matchId, attackerId]);

      await client.query(`
        UPDATE match_players 
        SET deaths = deaths + 1
        WHERE match_id = $1 AND user_id = $2
      `, [matchId, victimId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // 플레이어 데미지 이벤트 처리
  async handlePlayerDamage(matchId, attackerId, victimId, damage) {
    await this.processHitEvent({
      matchId,
      attackerId,
      victimId,
      damage,
      eventType: 'damage'
    });
  }
}

export default new GameEventService(); 
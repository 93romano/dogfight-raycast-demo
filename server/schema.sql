-- 1. users (유저 정보)
CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  username     TEXT   UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. matches (게임 세션 정보)
CREATE TABLE matches (
  id           SERIAL PRIMARY KEY,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ
);

-- 3. match_players (매치별 플레이어 상태)
CREATE TABLE match_players (
  id           SERIAL PRIMARY KEY,
  match_id     INTEGER NOT NULL REFERENCES matches(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  team         TEXT,
  score        INTEGER DEFAULT 0,
  kills        INTEGER DEFAULT 0,
  deaths       INTEGER DEFAULT 0
);

-- 4. hit_log (피격/킬 로그)
CREATE TABLE hit_log (
  event_id     TEXT        PRIMARY KEY,           -- Redis Stream ID
  event_type   TEXT        NOT NULL,              -- 'kill', 'damage' 등
  match_id     INTEGER     NOT NULL REFERENCES matches(id),
  attacker_id  INTEGER     NOT NULL REFERENCES users(id),
  victim_id    INTEGER     NOT NULL REFERENCES users(id),
  damage       INTEGER     NOT NULL,
  raw_payload  JSONB       NOT NULL,              -- 전체 페이로드
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_hitlog_match    ON hit_log(match_id);
CREATE INDEX idx_hitlog_attacker ON hit_log(attacker_id);
CREATE INDEX idx_hitlog_victim   ON hit_log(victim_id);

-- 5. rankings (누적 집계)
CREATE TABLE rankings (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id),
  total_kills  INTEGER DEFAULT 0,
  total_deaths INTEGER DEFAULT 0,
  total_score  INTEGER DEFAULT 0
); 
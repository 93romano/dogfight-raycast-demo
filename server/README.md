# Dogfight Game Server

실시간 멀티플레이어 비행 게임 서버 with PostgreSQL + Redis 데이터베이스 기능

## 📋 기능 개요

- **실시간 멀티플레이어 게임**: WebSocket 기반 초저지연 통신
- **데이터베이스 통합**: PostgreSQL + Redis 기반 게임 데이터 관리
- **이벤트 처리**: Redis Stream을 통한 실시간 이벤트 로깅
- **통계 관리**: 플레이어 랭킹 및 매치 통계 추적
- **백그라운드 워커**: 배치 처리를 통한 성능 최적화

## 🏗️ 시스템 구조

```
[Client]
  ├─ WebSocket emit 이벤트 (player_update, player_kill)
  └─ WebSocket on 이벤트 수신

     │
     ▼

[Socket-Server]
  ├─ 1) 이벤트 로그 저장 → Redis Stream
  │     XADD game_events * type kill data '{"attacker":..}'
  └─ 2) 즉시 브로드캐스트 → Redis Pub/Sub or io.emit()

     │
     ▼

[Redis]
  ├─ Stream    : 이벤트 큐 (XADD / XREADGROUP → Worker)
  └─ Pub/Sub   : 낮은 레이턴시 브로드캐스트

     │
     ▼

[Worker (별도 프로세스)]
  ├─ Redis Stream 읽기   : XREADGROUP group1 consumer1 …
  ├─ PostgreSQL 배치 쓰기:
  │     INSERT INTO hit_log(...)
  │     UPDATE rankings … (매치 종료 시)
  └─ Redis ACK & 정리     : XACK, DEL match:{id}:events

     │
     ▼

[PostgreSQL]
  ├─ hit_log       ← 배치 INSERT (게임 종료 or 실시간 배치)
  ├─ matches       ← 매치 시작/종료시 INSERT/UPDATE
  ├─ match_players ← 경기 종료시 점수·킬·데스 저장
  └─ rankings      ← 주기적 또는 경기 종료 후 집계
```

## 🔧 설치 및 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 설정:

```bash
# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=dogfight_game

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server Configuration
PORT=8080
NODE_ENV=development
```

### 3. PostgreSQL 설정

PostgreSQL 데이터베이스를 생성하고 스키마를 적용:

```bash
# 데이터베이스 생성
createdb dogfight_game

# 스키마 적용
psql -h localhost -U postgres -d dogfight_game -f schema.sql
```

### 4. Redis 설정

Redis 서버가 실행 중인지 확인:

```bash
redis-server
```

## 🚀 실행 방법

### 1. 메인 서버 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

### 2. 워커 프로세스 실행

별도 터미널에서:

```bash
# 개발 모드
npm run worker:dev

# 프로덕션 모드
npm run worker
```

## 📊 데이터베이스 스키마

### users (유저 정보)
- `id`: SERIAL PRIMARY KEY
- `username`: TEXT UNIQUE NOT NULL
- `created_at`: TIMESTAMPTZ DEFAULT NOW()

### matches (게임 세션 정보)
- `id`: SERIAL PRIMARY KEY
- `start_time`: TIMESTAMPTZ NOT NULL
- `end_time`: TIMESTAMPTZ

### match_players (매치별 플레이어 상태)
- `id`: SERIAL PRIMARY KEY
- `match_id`: INTEGER REFERENCES matches(id)
- `user_id`: INTEGER REFERENCES users(id)
- `team`: TEXT
- `score`: INTEGER DEFAULT 0
- `kills`: INTEGER DEFAULT 0
- `deaths`: INTEGER DEFAULT 0

### hit_log (피격/킬 로그)
- `event_id`: TEXT PRIMARY KEY (Redis Stream ID)
- `event_type`: TEXT NOT NULL ('kill', 'damage' 등)
- `match_id`: INTEGER REFERENCES matches(id)
- `attacker_id`: INTEGER REFERENCES users(id)
- `victim_id`: INTEGER REFERENCES users(id)
- `damage`: INTEGER NOT NULL
- `raw_payload`: JSONB
- `created_at`: TIMESTAMPTZ DEFAULT NOW()

### rankings (누적 집계)
- `user_id`: INTEGER PRIMARY KEY REFERENCES users(id)
- `total_kills`: INTEGER DEFAULT 0
- `total_deaths`: INTEGER DEFAULT 0
- `total_score`: INTEGER DEFAULT 0

## 📡 WebSocket API

### 클라이언트 → 서버

#### 연결
```
ws://localhost:8080?playerId=1234&username=Player1
```

#### 메시지 유형

```javascript
// 움직임 업데이트
{
  "type": "movement",
  "input": {
    "forward": true,
    "backward": false,
    "left": false,
    "right": true,
    "up": false,
    "down": false,
    "roll": 0
  },
  "position": [0, 0, 0],
  "rotation": [0, 0, 0, 1],
  "speed": 100
}

// 킬 이벤트
{
  "type": "kill",
  "victimId": 5678,
  "damage": 100
}

// 데미지 이벤트
{
  "type": "damage",
  "victimId": 5678,
  "damage": 25
}

// 통계 요청
{
  "type": "get-stats"
}

// 랭킹 요청
{
  "type": "get-rankings"
}

// 핑
{
  "type": "ping"
}
```

### 서버 → 클라이언트

```javascript
// 환영 메시지
{
  "type": "welcome",
  "playerId": 1234,
  "userId": 42,
  "username": "Player1",
  "matchId": 1
}

// 매치 시작
{
  "type": "match-started",
  "matchId": 1,
  "timestamp": 1234567890
}

// 플레이어 킬
{
  "type": "player-killed",
  "attackerId": 1234,
  "victimId": 5678,
  "damage": 100,
  "timestamp": 1234567890
}

// 매치 통계
{
  "type": "match-stats",
  "stats": [
    {
      "user_id": 42,
      "username": "Player1",
      "kills": 5,
      "deaths": 2,
      "score": 500
    }
  ]
}

// 글로벌 랭킹
{
  "type": "global-rankings",
  "rankings": [
    {
      "user_id": 42,
      "username": "Player1",
      "total_kills": 150,
      "total_deaths": 80,
      "total_score": 15000,
      "kd_ratio": 1.88
    }
  ]
}
```

## 🔍 모니터링 및 디버깅

### 로그 확인

```bash
# 서버 로그
tail -f server.log

# 워커 로그
tail -f worker.log
```

### Redis 모니터링

```bash
# Redis 스트림 확인
redis-cli XLEN game_events

# 컨슈머 그룹 상태 확인
redis-cli XINFO GROUPS game_events
```

### PostgreSQL 모니터링

```sql
-- 활성 매치 확인
SELECT * FROM matches WHERE end_time IS NULL;

-- 최신 히트 로그 확인
SELECT * FROM hit_log ORDER BY created_at DESC LIMIT 10;

-- 플레이어 랭킹 확인
SELECT u.username, r.* FROM rankings r JOIN users u ON r.user_id = u.id ORDER BY r.total_score DESC;
```

## 🔧 개발 도구

### 데이터베이스 초기화

```bash
npm run db:init
```

### 테스트 데이터 생성

```sql
-- 테스트 유저 생성
INSERT INTO users (username) VALUES ('TestPlayer1'), ('TestPlayer2');

-- 테스트 매치 생성
INSERT INTO matches (start_time) VALUES (NOW());
```

## 🚨 트러블슈팅

### 일반적인 문제들

1. **데이터베이스 연결 실패**
   - PostgreSQL 서버가 실행 중인지 확인
   - 환경 변수 설정 확인

2. **Redis 연결 실패**
   - Redis 서버가 실행 중인지 확인
   - Redis 포트 및 비밀번호 확인

3. **워커 프로세스 에러**
   - Redis Stream 권한 확인
   - 컨슈머 그룹 상태 확인

4. **WebSocket 연결 실패**
   - 클라이언트 URL 파라미터 확인
   - 서버 포트 확인

### 성능 최적화

1. **데이터베이스 인덱스 최적화**
2. **Redis 메모리 최적화**
3. **워커 배치 크기 조정**
4. **WebSocket 연결 풀링**

## 📈 확장 가능성

- **다중 서버 지원**: Redis Pub/Sub를 통한 서버 간 통신
- **매치메이킹**: 플레이어 레벨 기반 매칭
- **리플레이 시스템**: 매치 데이터 재생
- **실시간 분석**: 게임 메트릭 대시보드 
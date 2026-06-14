# Dogfight Raycast Demo - 프로젝트 기술 문서

> Google AI Studio 재구현을 위한 현재 프로젝트 기술 스택 및 기능 정리

---

## 1. 기술 스택 요약

| 영역 | 기술 | 버전 |
|------|------|------|
| **프론트엔드** | TypeScript + Three.js | TS 5.8.3 / Three.js 0.175.0 |
| **빌드 도구** | Vite | 6.3.2 |
| **백엔드** | Node.js (ES Modules) | - |
| **WebSocket** | ws 라이브러리 | 8.18.2 |
| **데이터베이스** | PostgreSQL | - |
| **캐시/스트림** | Redis (ioredis) | 5.3.2 |
| **기타** | uuid, dotenv, concurrently | - |

---

## 2. 프로젝트 구조

```
root/
├── client/                    # 프론트엔드 (Vite + TypeScript + Three.js)
│   ├── main.ts                # 진입점, Game 클래스, 애니메이션 루프
│   ├── index.html             # HTML + CSS (HUD, 크로스헤어, 데미지 이펙트)
│   ├── vite.config.ts         # Vite 설정 (포트 8000)
│   ├── network/
│   │   └── SocketManager.ts   # WebSocket 저수준 통신
│   ├── components/
│   │   ├── MultiplayerScene.ts    # 메인 씬 오케스트레이터
│   │   ├── PlayerIdInput.ts       # 로그인 UI
│   │   ├── assets/ModelCache.ts   # 3D 모델 캐싱
│   │   ├── input/InputManager.ts  # 키보드/마우스 입력
│   │   ├── network/
│   │   │   ├── NetworkManager.ts  # 네트워크 상위 래퍼
│   │   │   └── StateSync.ts      # 상태 변화 감지 & 전송
│   │   ├── physics/
│   │   │   ├── FlightPhysics.ts  # 비행 물리 시뮬레이션
│   │   │   └── types.ts
│   │   ├── players/
│   │   │   └── RemotePlayerManager.ts  # 원격 플레이어 관리
│   │   ├── weapons/
│   │   │   ├── WeaponSystem.ts   # 무기 & 레이캐스트 히트감지
│   │   │   └── VisualBullet.ts   # 총알 렌더링 & 트레일
│   │   ├── ui/GameHud.ts         # HUD (체력, 탄약, 속도 등)
│   │   └── environment/
│   │       ├── Environment.ts    # 환경 코디네이터
│   │       ├── Lighting.ts       # 조명 (방향광 + 앰비언트)
│   │       ├── Background.ts     # 배경 (3D 그리드 축)
│   │       └── Skybox.ts         # 스카이박스 (미사용)
│   └── public/assets/
│       ├── models/Jet.glb        # 전투기 3D 모델
│       └── skybox/*.jpg          # 스카이박스 텍스처 6면
│
├── server/                    # 백엔드 (Node.js + WebSocket)
│   ├── index.js               # 메인 서버 진입점
│   ├── worker.js              # 백그라운드 이벤트 워커
│   ├── schema.sql             # PostgreSQL 스키마
│   ├── config/database.js     # DB/Redis 연결 풀
│   ├── network/
│   │   ├── BinaryProtocol.js  # 바이너리 프로토콜
│   │   └── WebSocketManager.js # WebSocket 관리
│   ├── services/
│   │   ├── ConnectionManager.js   # 연결 라이프사이클
│   │   ├── MatchManager.js        # 매치 관리
│   │   ├── GameEventService.js    # 이벤트 영속화
│   │   └── RedisManager.js        # Redis 상태 관리
│   ├── handlers/
│   │   └── MessageHandler.js      # 메시지 라우팅
│   ├── game/
│   │   ├── GameState.js           # 인메모리 게임 상태
│   │   └── CombatSystem.js        # 전투 시스템
│   └── utils/Debug.js
│
└── package.json               # 모노레포 루트 (concurrently로 dev 실행)
```

---

## 3. 프론트엔드 기능 상세

### 3.1 게임 초기화 흐름
1. DOM 로드 → `Game` 클래스 생성
2. `GameHud` (UI 매니저) + `MultiplayerScene` (3D 씬) 초기화
3. `PlayerIdInput` 로그인 다이얼로그 표시
4. 유저 이름 입력 → WebSocket 연결 (`ws://localhost:8080?username={name}`)
5. 서버에서 `welcome` (playerId 할당) + `all-players` (초기 스냅샷) 수신
6. 원격 플레이어 모델 로드 → 애니메이션 루프 시작

### 3.2 렌더링 & 카메라 시스템
- **Three.js WebGLRenderer**: PCF 소프트 섀도우, 2048x2048 섀도우맵
- **카메라 FOV**: 기본 75° / 1인칭 65°
- **Far plane**: 1000 유닛
- **3인칭 카메라**: 오프셋 (0, 2, 8), lerp factor 0.5
- **1인칭 카메라**: 오프셋 (0, 0.25, -1.2), 사격 후 3초 유지, 250ms 전환
- **카메라 이펙트**: 사격 시 셰이크 (200ms, 진폭 0.02), 가속 지터

### 3.3 입력 시스템 (`InputManager`)
| 키 | 기능 |
|----|------|
| W / S | 전진 / 후진 (가감속) |
| A / D | 롤 (관성 시스템: 가속 0.001, 마찰 0.95) |
| ↑ / ↓ | 피치 (±0.03 rad/frame) |
| ← / → | 요 (±0.03 rad/frame) |
| Space | 사격 |
| R | 재장전 |
- 포인터 락 지원 (캔버스 클릭으로 활성화)

### 3.4 비행 물리 (`FlightPhysics`)
- **최대 속도**: 500 units/s
- **가속**: 10 units/s² (전진), 3 units/s² (감속)
- **마찰**: 0.99/frame (입력 없을 때)
- **회전 보간**: lerp factor 0.5
- **속도 보간**: lerp factor 0.1
- **최소 고도**: Y = 2 유닛
- **Euler 순서**: YXZ

### 3.5 무기 시스템 (`WeaponSystem`)
| 설정 | 값 |
|------|-----|
| 최대 탄약 | 100발 |
| 발사 속도 | 2발/초 (100ms 쿨다운) |
| 최대 사거리 | 1000 유닛 |
| 재장전 시간 | 3초 |
| 데미지 | 10/발 |

**사격 프로세스**:
1. 재장전/탄약/쿨다운 체크
2. 머즐 플래시 생성 (3D sphere + CSS 오버레이)
3. VisualBullet 생성 (속도 200 units/s, 수명 2초, 트레일 10세그먼트)
4. Raycaster로 카메라 중심에서 히트 검사
5. 히트 시 콜백 호출 + 빨간 히트 마커

### 3.6 원격 플레이어 관리 (`RemotePlayerManager`)
- Jet.glb 모델 로드 (ModelCache로 인스턴싱)
- 플레이어별 색상 틴트 (6색: red, green, blue, yellow, magenta, cyan)
- 이름 라벨 (Canvas 텍스처 Sprite, 3m 위)
- 위치 보간: lerp 0.3 / 이동 이벤트 시 0.4
- 히트 이펙트: 200ms 빨간색 플래시
- 리스폰 처리

### 3.7 UI/HUD (`GameHud`)
- 플레이어 ID, 속도, 위치 표시
- 체력 바 (>60% 초록, 30-60% 노랑, <30% 빨강)
- 탄약 수 + 무기 상태 (Ready/Reloading/Cooldown/Empty)
- 재장전 프로그레스 바
- 입력 상태 인디케이터 (8키)
- 크로스헤어 (고정 원형, 펄싱 애니메이션)
- 데미지 이펙트 (빨간 비네트 0.3s)

### 3.8 네트워크 통신 (`SocketManager` + `NetworkManager` + `StateSync`)

**발신 메시지 (JSON)**:
- `update` - 위치/회전 상태
- `movement` - 이동 이벤트 (입력 + 위치 + 회전 + 속도)
- `hit` - 히트 이벤트 (victimId, damage, position, distance)
- `ping` - 킵얼라이브

**수신 메시지 (JSON)**:
- `welcome` - playerId 할당
- `player-joined` / `player-left` - 입장/퇴장
- `player-update` - 상태 업데이트
- `all-players` - 초기 스냅샷
- `player-movement` - 원격 플레이어 이동
- `player-hit` - 피격 이벤트
- `player-death` - 사망/리스폰

**수신 메시지 (바이너리)**:
- `0x01 STATE_UPDATE` - 전체 플레이어 상태 (헤더 8B + 플레이어당 46B)

**연결 관리**:
- 재연결: 최대 10회, 500ms 지수 백오프
- 킵얼라이브: 2분 간격 ping, 10초 타임아웃
- 상태 전송: 위치/회전 16ms 간격, 이동 이벤트 100ms 간격
- 변화 감지 임계값: 위치 0.1 유닛, 회전 0.01 rad

### 3.9 인증 (`PlayerIdInput`)
- 모달 다이얼로그 (유저명 입력)
- 2-20자, 영문/숫자/한글/언더스코어/하이픈
- 첫 글자는 영문/숫자/한글만 허용

### 3.10 환경
- 검정 배경 + 3D 축 (X=빨강, Y=초록, Z=파랑)
- 그리드 헬퍼 3면 (XZ, XY, YZ), 크기 1000, 분할 10
- 방향광 (흰색, 강도 1, 위치 5,10,7) + 앰비언트 (회색, 강도 1)
- 스카이박스 텍스처 준비됨 (현재 미사용)

---

## 4. 서버 기능 상세

### 4.1 서버 초기화 흐름
1. HTTP 서버 생성 (포트 8080)
2. WebSocket 서버 부착
3. 코어 시스템 인스턴스화: GameState, RedisManager, ConnectionManager, WebSocketManager, MatchManager, CombatSystem, MessageHandler
4. 기존 연결 정리 (Redis 이전 세션)

### 4.2 연결 라이프사이클
**접속 시:**
1. 쿼리에서 username 추출
2. PostgreSQL에서 유저 생성/조회 → userId
3. Redis에서 기존 연결 확인 → 중복 시 강제 끊기 (Pub/Sub)
4. 매치에 플레이어 추가
5. wsId (UUID) 생성
6. Redis에 연결 상태 저장:
   - `connection:{playerId}` (TTL 2분)
   - `user:{userId}:session` (TTL 5분)
   - `match:{matchId}:players` (TTL 1시간)
7. 초기 상태 바이너리 전송 + welcome JSON
8. 다른 클라이언트에 player-joined 브로드캐스트

**접속 해제 시:**
1. Redis 연결 상태 제거
2. GameState에서 제거
3. 매치에서 제거 (플레이어 0명이면 매치 종료)
4. player-left 브로드캐스트

### 4.3 메시지 핸들러 (`MessageHandler`)
| 메시지 타입 | 처리 내용 |
|------------|----------|
| `movement` | 위치/회전/입력 업데이트 → GameState + Redis 저장 → 브로드캐스트 |
| `hit` | CombatSystem.handlePlayerHit() 호출 |
| `kill` | CombatSystem.handlePlayerDeath() 호출 |
| `reload` | CombatSystem.handlePlayerReload() 호출 |
| `damage` | GameEventService.handlePlayerDamage() (Redis 스트림) |
| `update` | 위치/회전 업데이트 → 브로드캐스트 |
| `ping` | `pong` 응답 |
| `get-stats` | 매치 통계 조회 |
| `get-rankings` | 글로벌 랭킹 조회 |

### 4.4 게임 상태 (`GameState`)
```javascript
PlayerState {
  position: [x, y, z],
  rotation: [x, y, z, w],    // 쿼터니언
  velocity: [x, y, z],
  inputState: { forward, backward, left, right, up, down, roll },
  speed: 0,
  health: 100, maxHealth: 100,
  lastShotTime: 0, shotCooldown: 500,  // 서버측 쿨다운 500ms
  ammo: 30, maxAmmo: 30,               // 서버측 탄약 30발
  isReloading: false, reloadDuration: 3000
}
```

### 4.5 전투 시스템 (`CombatSystem`)
**히트 처리:**
1. 양쪽 플레이어 존재 확인
2. 공격자 탄약 > 0 확인
3. 재장전 중 아닌지 확인
4. 발사 쿨다운 체크 (500ms)
5. 공격자 탄약 감소
6. 피해자 체력 감소 (최소 0)
7. `player-hit` 브로드캐스트
8. 체력 0 → `handlePlayerDeath()` 호출

**사망 처리:**
1. PostgreSQL + Redis에 킬 이벤트 기록
2. 공격자: kills +1, score +100
3. 피해자: deaths +1
4. 피해자 리스폰: 위치 [0, 10, 0], 체력 100
5. `player-death` 브로드캐스트

**재장전:**
- 3초 후 탄약 = maxAmmo
- `player-reload` / `player-reload-complete` 브로드캐스트

### 4.6 바이너리 프로토콜 (`BinaryProtocol`)
```
패킷 타입:
  0x01 STATE_UPDATE  - 전체 상태 동기화
  0x02 PLAYER_JOINED - 플레이어 입장
  0x03 PLAYER_LEFT   - 플레이어 퇴장
  0x04 INPUT         - 입력 명령

헤더 (8바이트):
  [0-1] 시퀀스 번호 (UInt16BE)
  [2]   패킷 타입 (UInt8)
  [3-6] 타임스탬프 (UInt32BE)
  [7]   플래그 (UInt8)

플레이어 상태 (46바이트/플레이어):
  [0-1]   플레이어 ID (UInt16BE)
  [2-13]  위치 x,y,z (Float32BE × 3)
  [14-29] 회전 x,y,z,w (Float32BE × 4)
  [30-41] 속도 x,y,z (Float32BE × 3)
  [42-45] 입력 상태 (UInt32BE 비트필드)

입력 비트필드:
  0x01=forward, 0x02=backward, 0x04=left,
  0x08=right, 0x10=up, 0x20=down
```

### 4.7 연결 관리 (`ConnectionManager`)
- 비활성 타임아웃: 2분
- 비활성 체크 간격: 30초
- 비활성 플레이어 자동 연결 해제

### 4.8 매치 관리 (`MatchManager`)
- 매치 생성 → PostgreSQL 기록
- 플레이어 추가/제거
- 플레이어 0명 시 자동 종료
- `match-started` / `match-ended` 브로드캐스트

### 4.9 Redis 상태 관리 (`RedisManager`)
- 연결 상태: `connection:{playerId}` (TTL 2분)
- 세션 정보: `user:{userId}:session` (TTL 5분)
- 매치 플레이어: `match:{matchId}:players` (TTL 1시간)
- 플레이어 상태: `player:{playerId}:state` (TTL 10분)
- 강제 연결 해제: Pub/Sub `force_disconnect` 채널
- 다중 서버 지원: SERVER_ID로 서버 식별

### 4.10 이벤트 영속화 (`GameEventService`)
- 유저 CRUD (PostgreSQL)
- 매치 생성/종료
- 킬/데미지 이벤트 → Redis Stream `game_events` + PostgreSQL `hit_log`
- 매치 통계 조회 (match_players JOIN users)
- 글로벌 랭킹 (rankings 테이블, KD ratio 계산)

### 4.11 백그라운드 워커 (`worker.js`)
- Redis Stream `game_events` 소비 (consumer group)
- 배치 처리: 100개/읽기, 2초 블록 타임아웃
- PostgreSQL `hit_log`에 삽입 (ON CONFLICT DO NOTHING, 멱등성)
- 랭킹 업데이트: 60분 간격
- 이벤트 정리: 24시간 간격, 7일 이상 삭제

---

## 5. 데이터베이스 스키마

```sql
-- 유저
users (id SERIAL PK, username TEXT UNIQUE, created_at TIMESTAMPTZ)

-- 매치
matches (id SERIAL PK, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ)

-- 매치별 플레이어 통계
match_players (id SERIAL PK, match_id FK, user_id FK, team TEXT,
               score INT=0, kills INT=0, deaths INT=0)

-- 전투 이벤트 로그
hit_log (event_id TEXT PK, event_type TEXT, match_id FK,
         attacker_id FK, victim_id FK, damage INT,
         raw_payload JSONB, created_at TIMESTAMPTZ)
  -- 인덱스: match_id, attacker_id, victim_id

-- 누적 랭킹
rankings (user_id INT PK FK, total_kills INT=0,
          total_deaths INT=0, total_score INT=0)
```

---

## 6. 환경 변수

```env
# 서버
PORT=8080
NODE_ENV=development
TICK_RATE=60
MAX_PLAYERS=20
MATCH_DURATION=300000

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=dogfight_database

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 워커
WORKER_BATCH_SIZE=100
WORKER_CONSUMER_GROUP=game_events_group
WORKER_STREAM_KEY=game_events

# 클라이언트
VITE_WS_URL=ws://localhost:8080
VITE_API_URL=http://localhost:8080
```

---

## 7. 주요 게임 상수 요약

| 구분 | 항목 | 클라이언트 | 서버 |
|------|------|-----------|------|
| **비행** | 최대 속도 | 500 units/s | - |
| | 가속 | 10 units/s² | - |
| | 감속 | 3 units/s² | - |
| **무기** | 탄약 | 100발 | 30발 |
| | 발사 쿨다운 | 100ms | 500ms |
| | 재장전 | 3초 | 3초 |
| | 데미지 | 10/발 | - |
| **체력** | 최대 HP | 100 | 100 |
| | 킬 스코어 | - | +100 |
| | 리스폰 위치 | - | [0, 10, 0] |
| **네트워크** | 상태 전송 | 16ms | - |
| | 이동 이벤트 | 100ms | - |
| | 킵얼라이브 | 2분 | - |
| | 비활성 타임아웃 | - | 2분 |
| **틱** | 게임 루프 | requestAnimationFrame | 60Hz (설정값) |

---

## 8. 3D 에셋

- **Jet.glb**: 전투기 모델 (Poly Pizza, CC-BY 3.0, by jeremy)
  - 스케일: (0.5, 0.5, 0.5), Y축 180° 회전
- **스카이박스**: 6면 valley 텍스처 (OpenGameArt, CC BY-SA 3.0)
  - 현재 미사용 (검정 배경 사용 중)

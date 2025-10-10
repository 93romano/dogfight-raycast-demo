# 2025-10-10 개발 세션 리뷰

## 목차
- [Redis와 PostgreSQL 설치 및 실행](#redis와-postgresql-설치-및-실행)
- [Player ID 표시 기능 구현](#player-id-표시-기능-구현)
- [이벤트 기반 아키텍처 구현](#이벤트-기반-아키텍처-구현)
- [연결 끊김 처리](#연결-끊김-처리)
- [Username 쿼리 파라미터 전달](#username-쿼리-파라미터-전달)
- [Promise와 비동기 처리 심화 학습](#promise와-비동기-처리-심화-학습)

---

## Redis와 PostgreSQL 설치 및 실행

### 문제
Redis와 PostgreSQL의 설치 방식이 달라서 실행 방법을 확인하고 싶음

### 해결책
두 서비스 모두 Homebrew로 설치되어 있음을 확인

#### Redis 실행 방법
```bash
# 서비스로 시작 (백그라운드에서 계속 실행)
brew services start redis

# 직접 실행 (터미널에서 포그라운드 실행)
redis-server

# 데몬 모드로 실행
redis-server --daemonize yes

# 중지
brew services stop redis
```

#### PostgreSQL 실행 방법
```bash
# 서비스로 시작 (백그라운드에서 계속 실행)
brew services start postgresql@15

# 직접 실행 (데이터 디렉토리 지정 필요)
postgres -D /opt/homebrew/var/postgresql@15

# 중지
brew services stop postgresql@15
```

#### 연결 테스트
```bash
# Redis 연결 테스트
redis-cli ping

# PostgreSQL 연결 테스트
psql -d postgres -c "SELECT version();"
```

---

## Player ID 표시 기능 구현

### 문제
게임 시작 후 서버에 접속하면 Player ID를 HUD에 표시하고 싶음

### 기존 코드 분석
- `updatePlayerId()` 메서드는 정의되어 있지만 호출되지 않음
- 애니메이션 루프에서 매번 호출하는 것은 비효율적

### 해결 방향
Public 메서드 vs 이벤트 기반 처리 방식 비교 후 **이벤트 기반 방식** 선택

#### Public 메서드 방식
```typescript
// 장점: 간단하고 직관적
// 단점: 클래스 간 강한 결합, Game 인스턴스 참조 필요
gameInstance.updatePlayerId();
```

#### 이벤트 기반 방식 (채택)
```typescript
// 장점: 느슨한 결합, 캡슐화 유지, 확장성 좋음
// 단점: 약간 더 복잡함
window.dispatchEvent(new CustomEvent('playerConnected', {
  detail: { playerId, username }
}));
```

---

## 이벤트 기반 아키텍처 구현

### 구현 단계

#### 1. MultiplayerScene에서 연결 성공 이벤트 발생
```typescript
// MultiplayerScene.ts
try {
  await this.networkManager.connect(username);

  // 연결 성공 이벤트 발생
  window.dispatchEvent(new CustomEvent('playerConnected', {
    detail: {
      playerId: this.networkManager.getPlayerId(),
      username: username
    }
  }));

  this.createCrosshair();
  // ...
}
```

#### 2. main.ts에서 이벤트 리스너 추가
```typescript
// main.ts 생성자에서
window.addEventListener('playerConnected', (event: Event) => {
  const customEvent = event as CustomEvent;
  this.updatePlayerId(customEvent.detail?.playerId);
});
```

#### 3. updatePlayerId 메서드 개선
```typescript
private updatePlayerId = (playerId?: number, disconnected = false) => {
  if (playerId !== undefined) {
    this.playerIdElement.textContent = playerId.toString();
  } else if (disconnected) {
    this.playerIdElement.textContent = '연결 끊김';
  } else {
    this.playerIdElement.textContent = '...';
  }
};
```

---

## 연결 끊김 처리

### 문제
연결이 끊어지면 다시 접속해야 하므로 `playerDisconnected` 이벤트 처리 필요

### 구현

#### 1. SocketManager에서 연결 끊김 이벤트 발생
```typescript
// SocketManager.ts
this.socket.onclose = (event) => {
  console.log(`❌ Disconnected from server. Code: ${event.code}, Reason: ${event.reason}`);
  this.stopKeepAlive();

  // 연결 끊김 이벤트 발생
  window.dispatchEvent(new CustomEvent('playerDisconnected', {
    detail: {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    }
  }));

  // 정상적인 종료가 아닌 경우 재연결 시도
  if (event.code !== 1000 && event.code !== 1001) {
    this.scheduleReconnect();
  }
};
```

#### 2. main.ts에서 연결 끊김 이벤트 리스너 추가
```typescript
// main.ts
window.addEventListener('playerDisconnected', () => {
  this.updatePlayerId(undefined, true); // 연결 끊김 상태로 표시
});
```

### 최종 동작 흐름
1. **게임 시작**: Player ID "..." 표시
2. **서버 연결 성공**: Player ID "123" 표시
3. **연결 끊김**: Player ID "연결 끊김" 표시
4. **재연결 성공**: Player ID "456" 표시 (새로운 ID일 수 있음)

---

## Username 쿼리 파라미터 전달

### 질문
서버에서 `const username = url.searchParams.get('username');` 코드가 작동하는지 확인

### 클라이언트 구현 확인

#### Username 전달 흐름
1. **MultiplayerScene.ts**: `networkManager.connect(username)` 호출
2. **NetworkManager.ts**: `socket.connectWithUsername(username)` 호출
3. **SocketManager.ts**: 쿼리 파라미터로 전달

```typescript
// SocketManager.ts
private connect() {
  const params = new URLSearchParams();
  if (this.username) {
    params.append('username', this.username);
  }

  const wsUrl = `ws://localhost:8080?${params.toString()}`;
  this.socket = new WebSocket(wsUrl);
}
```

#### 서버에서 수신
```javascript
// server/index.js
const url = new URL(req.url, 'http://localhost');
const username = url.searchParams.get('username');
// WebSocket 연결 URL 예시: ws://localhost:8080?username=player123
```

**결론**: 클라이언트에서 username을 쿼리 파라미터로 올바르게 전달하고 있음

---

## Promise와 비동기 처리 심화 학습

### 질문
NetworkManager의 복잡한 Promise 구조 분석 요청

### 핵심 코드 분석
```typescript
return new Promise((resolve, reject) => {
  let isResolved = false;

  this.socket = new SocketManager(
    // ... 핸들러들
    (players) => {
      this.handlers.onAllPlayers(players);
      if (!isResolved) {
        isResolved = true;
        resolve(); // 연결 성공
      }
    }
  );

  const checkConnection = () => {
    if (this.socket?.isConnected() && this.socket?.getPlayerId()) {
      if (!isResolved) {
        isResolved = true;
        resolve();
      }
    } else if (!isResolved) {
      setTimeout(checkConnection, 100);
    }
  };

  // 타임아웃, 에러 처리 등...
});
```

### 핵심 개념 정리

#### Promise 상태 변화
- **pending** → **fulfilled(resolved)** 또는 **rejected**
- `resolve()`는 Promise를 fulfilled 상태로 변경
- 동기 함수여도 "조건 달성 시점"을 알리기 위해 resolve 사용

#### 이중 성공 감지 메커니즘
1. **onAllPlayers 콜백**: 초기 게임 상태 수신 시
2. **checkConnection 폴링**: 연결 + Player ID 조건 만족 시

#### isResolved 플래그의 중요성
4개의 독립적 완료 경로에서 중복 resolve/reject 방지:

1. **onAllPlayers 콜백 완료**
2. **checkConnection 조건 만족**
3. **타임아웃 에러**
4. **try-catch 에러**

### 타이밍 시나리오

#### 시나리오 A: onAllPlayers 먼저 완료
```
400ms: ✅ onAllPlayers 콜백 → resolve() (isResolved = true)
500ms: checkConnection → isResolved가 true이므로 무시
```

#### 시나리오 B: checkConnection 먼저 완료
```
500ms: ✅ checkConnection 조건 만족 → resolve() (isResolved = true)
600ms: onAllPlayers → isResolved가 true이므로 무시
```

### Race Condition 방지
```javascript
// 문제가 될 수 있는 상황
setTimeout(() => resolve('첫 번째'), 200);
setTimeout(() => resolve('두 번째'), 300); // Promise는 이미 settled!

// 해결책
if (!isResolved) {
  isResolved = true;
  resolve();
}
```

### 실제 연결 성공 판정 조건
1. **WebSocket 연결 완료**: `this.socket?.isConnected()`
2. **서버로부터 Player ID 할당**: `this.socket?.getPlayerId()`
3. **초기 게임 상태 수신**: `onAllPlayers` 콜백 호출

---

## 생성된 파일

### test-nodes.js
Promise 상태 변화와 resolve 개념을 초급부터 상급까지 정리한 테스트 파일

실행 방법:
```bash
node test-nodes.js
```

포함 내용:
- 초급: 기본 Promise 상태 변화, 동기 작업에서의 resolve
- 중급: 타이밍 제어, 여러 완료 경로 처리
- 상급: 게임 연결 시나리오 시뮬레이션, Promise 상태 시각화

---

## 주요 학습 포인트

1. **이벤트 기반 아키텍처**의 장점: 느슨한 결합, 확장성
2. **방어적 프로그래밍**: isResolved 플래그로 안전성 보장
3. **Promise 상태 관리**: 여러 완료 경로에서의 race condition 방지
4. **비동기 조건 달성**: 동기 함수여도 조건부 완료를 위한 Promise 활용
5. **네트워크 상태 관리**: 연결/끊김 상태의 명확한 UI 표시

---

## 다음 단계 제안

1. **에러 처리 강화**: 다양한 연결 실패 시나리오 대응
2. **재연결 로직 개선**: 지수 백오프, 최대 재시도 횟수 조정
3. **상태 지속성**: localStorage를 활용한 사용자 설정 저장
4. **성능 최적화**: 불필요한 이벤트 발생 최소화
5. **테스트 코드 작성**: 연결 시나리오별 단위 테스트
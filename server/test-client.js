#!/usr/bin/env node

// server/test-client.js
// WebSocket 메시지 시퀀스 시뮬레이션 테스트 클라이언트
//
// 사용법:
//   node test-client.js                          # 기본 시나리오 전체 실행
//   node test-client.js --scenario connect        # 접속만 테스트
//   node test-client.js --scenario movement       # 이동 시퀀스 테스트
//   node test-client.js --scenario combat         # 전투 시퀀스 테스트 (클라이언트 2개)
//   node test-client.js --scenario reload         # 재장전 테스트
//   node test-client.js --scenario multi          # 다중 클라이언트 동시 접속
//   node test-client.js --scenario stress         # 스트레스 테스트 (빠른 메시지 전송)
//   node test-client.js --scenario full           # 전체 게임 라이프사이클
//   node test-client.js --url ws://host:port      # 커스텀 서버 주소

import WebSocket from 'ws';

// ─── Configuration ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const scenarioFlag = args.indexOf('--scenario');
const urlFlag = args.indexOf('--url');

const SCENARIO = scenarioFlag !== -1 ? args[scenarioFlag + 1] : 'full';
const SERVER_URL = urlFlag !== -1 ? args[urlFlag + 1] : 'ws://localhost:8080';

const HEADER_SIZE = 8;
const PLAYER_STATE_SIZE = 46;

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(tag, msg, data) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}] [${tag}]`;
  if (data !== undefined) {
    console.log(prefix, msg, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(prefix, msg);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseBinaryStateUpdate(buffer) {
  const buf = Buffer.from(buffer);
  if (buf.length < HEADER_SIZE) return null;

  const header = {
    sequence: buf.readUInt16BE(0),
    packetType: buf.readUInt8(2),
    timestamp: buf.readUInt32BE(3),
    flags: buf.readUInt8(7),
  };

  // 상태 업데이트(0x01) 패킷만 플레이어 배열로 파싱
  if (header.packetType !== 0x01) {
    return { header, players: [] };
  }

  // floor 처리로 정렬되지 않은 버퍼의 끝부분을 OOB로 읽어 프로세스가 죽는 것을 방지
  const playerCount = Math.floor((buf.length - HEADER_SIZE) / PLAYER_STATE_SIZE);
  const players = [];

  for (let i = 0; i < playerCount; i++) {
    let off = HEADER_SIZE + i * PLAYER_STATE_SIZE;
    const id = buf.readUInt16BE(off); off += 2;
    const position = [buf.readFloatBE(off), buf.readFloatBE(off + 4), buf.readFloatBE(off + 8)]; off += 12;
    const rotation = [buf.readFloatBE(off), buf.readFloatBE(off + 4), buf.readFloatBE(off + 8), buf.readFloatBE(off + 12)]; off += 16;
    const velocity = [buf.readFloatBE(off), buf.readFloatBE(off + 4), buf.readFloatBE(off + 8)]; off += 12;
    const inputState = buf.readUInt32BE(off);
    players.push({ id, position, rotation, velocity, inputState });
  }

  return { header, players };
}

// ─── TestClient ─────────────────────────────────────────────────────────────

class TestClient {
  constructor(username) {
    this.username = username;
    this.ws = null;
    this.playerId = null;
    this.userId = null;
    this.matchId = null;
    this.connected = false;
    this.messages = [];       // 수신 JSON 메시지 기록
    this.binaryMessages = []; // 수신 바이너리 메시지 기록
    this.messageHandlers = new Map();
  }

  // 서버 접속 후 welcome 메시지 수신까지 대기
  connect(url = SERVER_URL) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

      this.ws = new WebSocket(`${url}?username=${this.username}`);
      this.ws.binaryType = 'arraybuffer';

      this.ws.on('open', () => {
        log(this.username, '연결 성공');
      });

      this.ws.on('message', (data, isBinary) => {
        // 바이너리 메시지 (ws는 텍스트 프레임도 Buffer로 전달하므로 isBinary로 판별)
        if (isBinary) {
          const parsed = parseBinaryStateUpdate(data);
          if (parsed) {
            this.binaryMessages.push(parsed);
            log(this.username, `바이너리 수신: ${parsed.players.length}명 플레이어 상태`);
            this._emit('binary', parsed);
          }
          return;
        }

        // 텍스트 메시지
        const str = data.toString();
        if (str === 'pong') {
          log(this.username, 'pong 수신');
          this._emit('pong', null);
          return;
        }

        try {
          const msg = JSON.parse(str);
          this.messages.push(msg);
          log(this.username, `수신: ${msg.type}`, msg);
          this._emit(msg.type, msg);

          if (msg.type === 'welcome') {
            this.playerId = msg.playerId;
            this.userId = msg.userId;
            this.matchId = msg.matchId;
            this.connected = true;
            clearTimeout(timeout);
            resolve(this);
          }
        } catch (e) {
          log(this.username, '파싱 실패:', str);
        }
      });

      this.ws.on('close', (code, reason) => {
        log(this.username, `연결 종료: code=${code} reason=${reason}`);
        this.connected = false;
      });

      this.ws.on('error', (err) => {
        log(this.username, `에러: ${err.message}`);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // 특정 메시지 타입 대기
  waitFor(type, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout waiting for "${type}"`)), timeoutMs);
      this._once(type, (msg) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });
  }

  // JSON 메시지 전송
  send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }
    const payload = JSON.stringify(data);
    log(this.username, `전송: ${data.type}`, data);
    this.ws.send(payload);
  }

  // 텍스트 메시지 전송 (ping용)
  sendRaw(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }
    log(this.username, `전송(raw): ${text}`);
    this.ws.send(text);
  }

  // 이동 이벤트 전송
  sendMovement(position, rotation, input = {}, speed = 50) {
    this.send({
      type: 'movement',
      event: {
        input: {
          forward: input.forward || false,
          backward: input.backward || false,
          left: input.left || false,
          right: input.right || false,
          up: input.up || false,
          down: input.down || false,
          roll: input.roll || 0,
        },
        position,
        rotation,
        speed,
      },
      playerId: this.playerId,
    });
  }

  // 히트 이벤트 전송
  sendHit(victimId, damage = 10, position = [0, 0, 0], distance = 50) {
    this.send({
      type: 'hit',
      victimId,
      damage,
      position,
      distance,
      timestamp: Date.now(),
    });
  }

  // 재장전 이벤트 전송
  sendReload() {
    this.send({ type: 'reload' });
  }

  // 핑 전송 (텍스트)
  sendPing() {
    this.sendRaw('ping');
  }

  // 상태 업데이트 전송
  sendUpdate(position, rotation) {
    this.send({
      type: 'update',
      state: { position, rotation },
      playerId: this.playerId,
    });
  }

  // 연결 종료
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Test complete');
    }
  }

  // 수신 메시지 중 특정 타입 필터
  getMessages(type) {
    return this.messages.filter(m => m.type === type);
  }

  // 간단한 이벤트 시스템
  _emit(type, data) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      for (const h of handlers) h(data);
    }
  }

  _once(type, handler) {
    const wrapped = (data) => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        const idx = handlers.indexOf(wrapped);
        if (idx !== -1) handlers.splice(idx, 1);
      }
      handler(data);
    };
    if (!this.messageHandlers.has(type)) this.messageHandlers.set(type, []);
    this.messageHandlers.get(type).push(wrapped);
  }

  on(type, handler) {
    if (!this.messageHandlers.has(type)) this.messageHandlers.set(type, []);
    this.messageHandlers.get(type).push(handler);
  }
}

// ─── Test Scenarios ─────────────────────────────────────────────────────────

const scenarios = {};

// 1) 접속 테스트
scenarios.connect = async () => {
  console.log('\n=== 시나리오: 접속 테스트 ===\n');

  const client = new TestClient('test-pilot-1');
  await client.connect();

  assert(client.connected, '클라이언트 연결됨');
  assert(client.playerId != null, `playerId 할당됨: ${client.playerId}`);
  assert(client.matchId != null, `matchId 할당됨: ${client.matchId}`);
  assert(client.binaryMessages.length > 0, '초기 바이너리 상태 수신');

  // ping/pong 테스트
  const pongPromise = client.waitFor('pong', 3000);
  client.sendPing();
  await pongPromise;
  log('TEST', 'ping/pong 정상');

  client.disconnect();
  await sleep(500);
  log('TEST', '접속 테스트 통과 ✓');
};

// 2) 이동 시퀀스 테스트
scenarios.movement = async () => {
  console.log('\n=== 시나리오: 이동 시퀀스 테스트 ===\n');

  const client = new TestClient('test-pilot-move');
  await client.connect();

  // 연속 이동 메시지 전송
  const positions = [
    { pos: [0, 10, 0],   rot: [0, 0, 0, 1],       input: { forward: true } },
    { pos: [5, 10, 0],   rot: [0, 0.1, 0, 0.995],  input: { forward: true, right: true } },
    { pos: [10, 12, 5],  rot: [0, 0.3, 0, 0.954],  input: { forward: true, up: true } },
    { pos: [15, 12, 10], rot: [0, 0.5, 0, 0.866],  input: { forward: true, left: true, roll: 0.5 } },
    { pos: [20, 10, 15], rot: [0, 0.7, 0, 0.714],  input: { backward: true, down: true } },
  ];

  let ackCount = 0;
  client.on('movement-ack', () => ackCount++);

  for (const { pos, rot, input } of positions) {
    client.sendMovement(pos, rot, input, 60);
    await sleep(100);
  }

  await sleep(500);
  assert(ackCount === positions.length, `이동 ACK ${ackCount}/${positions.length}회 수신`);

  // update 메시지도 테스트
  client.sendUpdate([25, 10, 20], [0, 1, 0, 0]);
  await sleep(200);

  client.disconnect();
  await sleep(500);
  log('TEST', '이동 시퀀스 테스트 통과 ✓');
};

// 3) 전투 시퀀스 테스트
scenarios.combat = async () => {
  console.log('\n=== 시나리오: 전투 시퀀스 테스트 ===\n');

  const attacker = new TestClient('test-attacker');
  const victim = new TestClient('test-victim');

  await attacker.connect();
  await victim.connect();

  // victim이 player-joined 수신 확인
  assert(attacker.playerId !== victim.playerId, '서로 다른 playerId 할당');

  // 공격자가 피해자를 공격
  let hitReceived = false;
  victim.on('player-hit', (msg) => {
    hitReceived = true;
    log('TEST', `피격 이벤트 수신: 공격자=${msg.attackerId} 피해자=${msg.victimId} 데미지=${msg.damage} 남은체력=${msg.victimHealth}`);
  });

  attacker.sendHit(victim.playerId, 25, [5, 10, 3], 30);
  await sleep(500);
  assert(hitReceived, '피격 이벤트 수신됨');

  // 연속 공격으로 사망 유도 (체력 100, 25씩 4번 = 사망)
  let deathReceived = false;
  victim.on('player-death', (msg) => {
    deathReceived = true;
    log('TEST', `사망 이벤트 수신: 리스폰 위치=${JSON.stringify(msg.respawnPosition)}`);
  });

  // 연사 제한(500ms) 고려하여 간격을 두고 공격
  for (let i = 0; i < 3; i++) {
    await sleep(550);
    attacker.sendHit(victim.playerId, 25, [5, 10, 3], 30);
  }

  await sleep(500);
  assert(deathReceived, '사망 이벤트 수신됨');

  attacker.disconnect();
  victim.disconnect();
  await sleep(500);
  log('TEST', '전투 시퀀스 테스트 통과 ✓');
};

// 4) 재장전 테스트
scenarios.reload = async () => {
  console.log('\n=== 시나리오: 재장전 테스트 ===\n');

  const client = new TestClient('test-reloader');
  const dummy = new TestClient('test-dummy');

  await client.connect();
  await dummy.connect();

  // 탄약 소모 (히트 전송으로 서버 측 ammo 감소)
  for (let i = 0; i < 3; i++) {
    client.sendHit(dummy.playerId, 5, [0, 0, 0], 10);
    await sleep(550);
  }

  // 재장전 시작
  let reloadStarted = false;
  let reloadCompleted = false;

  client.on('player-reload', (msg) => {
    reloadStarted = true;
    log('TEST', `재장전 시작: duration=${msg.reloadDuration}ms`);
  });

  client.on('player-reload-complete', (msg) => {
    reloadCompleted = true;
    log('TEST', `재장전 완료: ammo=${msg.ammo}/${msg.maxAmmo}`);
  });

  client.sendReload();
  await sleep(500);
  assert(reloadStarted, '재장전 시작 이벤트 수신됨');

  // 재장전 완료 대기 (3초 + 여유)
  await sleep(3500);
  assert(reloadCompleted, '재장전 완료 이벤트 수신됨');

  client.disconnect();
  dummy.disconnect();
  await sleep(500);
  log('TEST', '재장전 테스트 통과 ✓');
};

// 5) 다중 클라이언트 동시 접속
scenarios.multi = async () => {
  console.log('\n=== 시나리오: 다중 클라이언트 동시 접속 ===\n');

  const NUM_CLIENTS = 5;
  const clients = [];

  // 동시 접속
  const connectPromises = [];
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const c = new TestClient(`pilot-${i}`);
    clients.push(c);
    connectPromises.push(c.connect());
  }

  await Promise.all(connectPromises);
  log('TEST', `${NUM_CLIENTS}명 동시 접속 성공`);

  // 전원 동시에 이동
  for (const c of clients) {
    c.sendMovement(
      [Math.random() * 100, 10 + Math.random() * 20, Math.random() * 100],
      [0, Math.random(), 0, 1],
      { forward: true },
      50 + Math.random() * 50
    );
  }
  await sleep(500);

  // player-joined 수신 확인 (첫 번째 클라이언트는 이후 접속자 알림을 받음)
  const firstJoinMessages = clients[0].getMessages('player-joined');
  log('TEST', `첫 번째 클라이언트가 받은 player-joined: ${firstJoinMessages.length}개`);

  // 한 명 연결 해제 → 나머지가 player-left 수신 확인
  const leftPromises = clients.slice(1).map(c =>
    c.waitFor('player-left', 3000).catch(() => null)
  );
  clients[0].disconnect();
  await Promise.all(leftPromises);

  const leftMessages = clients[1].getMessages('player-left');
  assert(leftMessages.length > 0, `player-left 이벤트 수신됨 (${leftMessages.length}개)`);

  // 나머지 정리
  for (let i = 1; i < NUM_CLIENTS; i++) {
    clients[i].disconnect();
  }

  await sleep(500);
  log('TEST', '다중 클라이언트 테스트 통과 ✓');
};

// 6) 스트레스 테스트
scenarios.stress = async () => {
  console.log('\n=== 시나리오: 스트레스 테스트 ===\n');

  const client = new TestClient('stress-pilot');
  await client.connect();

  const MSG_COUNT = 100;
  const startTime = Date.now();
  let ackCount = 0;

  client.on('movement-ack', () => ackCount++);

  // 빠르게 100개 이동 메시지 전송
  for (let i = 0; i < MSG_COUNT; i++) {
    const t = i / MSG_COUNT;
    client.sendMovement(
      [Math.cos(t * Math.PI * 2) * 50, 10, Math.sin(t * Math.PI * 2) * 50],
      [0, Math.sin(t * Math.PI), 0, Math.cos(t * Math.PI)],
      { forward: true, roll: Math.sin(t * Math.PI * 4) },
      80
    );
    // 16ms 간격 (60Hz 시뮬레이션)
    await sleep(16);
  }

  await sleep(1000);
  const elapsed = Date.now() - startTime;
  log('TEST', `${MSG_COUNT}개 메시지 전송 완료: ${elapsed}ms, ACK ${ackCount}/${MSG_COUNT}`);

  client.disconnect();
  await sleep(500);
  log('TEST', '스트레스 테스트 통과 ✓');
};

// 7) 전체 게임 라이프사이클
scenarios.full = async () => {
  console.log('\n=== 시나리오: 전체 게임 라이프사이클 ===\n');

  // Phase 1: 접속
  log('PHASE', '1/5 - 접속');
  const player1 = new TestClient('ace-1');
  const player2 = new TestClient('ace-2');

  await player1.connect();
  await player2.connect();
  assert(player1.connected && player2.connected, '두 플레이어 접속 성공');

  // Phase 2: 이동
  log('PHASE', '2/5 - 이동');
  let p2MovementReceived = false;
  player2.on('player-movement', () => { p2MovementReceived = true; });

  player1.sendMovement([10, 15, 5], [0, 0.3, 0, 0.954], { forward: true, up: true }, 70);
  await sleep(300);
  assert(p2MovementReceived, 'player2가 player1의 이동을 수신');

  // Phase 3: 전투
  log('PHASE', '3/5 - 전투');
  let combatHit = false;
  player2.on('player-hit', () => { combatHit = true; });

  player1.sendHit(player2.playerId, 20, [10, 15, 5], 25);
  await sleep(300);
  assert(combatHit, '전투 히트 이벤트 확인');

  // Phase 4: 재장전
  log('PHASE', '4/5 - 재장전');
  let reloadDone = false;
  player1.on('player-reload-complete', () => { reloadDone = true; });

  // 탄약 소모를 위한 추가 공격
  for (let i = 0; i < 5; i++) {
    player1.sendHit(player2.playerId, 5, [10, 15, 5], 25);
    await sleep(550);
  }
  player1.sendReload();
  await sleep(4000);
  assert(reloadDone, '재장전 완료 확인');

  // Phase 5: ping/pong & 연결 해제
  log('PHASE', '5/5 - ping/pong & 연결 해제');
  const pong = player1.waitFor('pong', 3000);
  player1.sendPing();
  await pong;
  log('TEST', 'ping/pong 정상');

  // player1 퇴장 → player2에게 player-left 도착
  const leftP = player2.waitFor('player-left', 3000);
  player1.disconnect();
  await leftP;
  log('TEST', 'player-left 이벤트 수신');

  player2.disconnect();
  await sleep(500);

  log('TEST', '전체 게임 라이프사이클 테스트 통과 ✓');
};

// ─── Assertion & Runner ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    log('ASSERT', `✓ ${message}`);
  } else {
    failed++;
    log('ASSERT', `✗ ${message}`);
  }
}

async function run() {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Dogfight WebSocket 테스트 클라이언트         ║`);
  console.log(`║  서버: ${SERVER_URL.padEnd(36)}║`);
  console.log(`║  시나리오: ${SCENARIO.padEnd(33)}║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  const fn = scenarios[SCENARIO];
  if (!fn) {
    console.error(`알 수 없는 시나리오: "${SCENARIO}"`);
    console.error(`사용 가능: ${Object.keys(scenarios).join(', ')}`);
    process.exit(1);
  }

  try {
    await fn();
  } catch (err) {
    log('ERROR', `시나리오 실패: ${err.message}`);
    console.error(err);
    failed++;
  }

  console.log(`\n════════════════════════════════════════════════`);
  console.log(`  결과: ${passed} 통과, ${failed} 실패`);
  console.log(`════════════════════════════════════════════════\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();

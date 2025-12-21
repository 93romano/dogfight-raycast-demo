# 사격/카메라 UX 개선 정리

본 문서는 최근 적용된 화면 중앙 레이캐스트, 1인칭(콕핏) 전환, CSS 크로스헤어, 스프라이트(이름표) 제외 판정, 성능 폴백, 로컬 기체 숨김 처리 등의 변경 사항과 튜닝 포인트를 정리합니다.

## 개요
- 조준 레이캐스트를 화면 중앙 기준으로 고정하여 FPS 스타일의 조준감을 제공합니다.
- 사격 시 0.25초 내로 1인칭(콕핏) 카메라로 전환되고 3초간 유지됩니다.
- 1인칭 유지 동안 로컬 기체 모델은 화면에서 숨겨(visible=false) 시야를 가리지 않습니다.
- 월드 공간 링 조준점은 제거하고, CSS 크로스헤어를 사용합니다.
- 스프라이트(플레이어 이름표)는 타격 대상으로 인정하지 않으며, 실제 메시만 판정합니다.
- 성능 저하 시(프레임 시간 > 50ms) 카메라 전환/줌을 즉시 적용하고 흔들림을 비활성화합니다.

## 핵심 변경 사항
- 화면 중앙 레이캐스트 고정
  - `client/components/weapons/WeaponSystem.ts:91` – `this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);`
  - `client/components/weapons/WeaponSystem.ts:93` – `this.raycaster.camera = this.camera;` (Sprite 경고/오류 방지)
- 스프라이트(이름표) 제외 판정 및 실제 메시만 히트
  - `client/components/weapons/WeaponSystem.ts:117` – `instanceof THREE.Sprite` 필터링
  - `client/components/weapons/WeaponSystem.ts:126` – 부모 체인을 따라 맞은 오브젝트 → 플레이어 매핑
- 히트 처리 콜백 → 서버 동기화
  - `client/components/weapons/WeaponSystem.ts:132` – `onHitCallback(targetId, damage, point, distance)` 호출
  - `client/network/SocketManager.ts:473` – `sendHit(...)` 메시지 전송
  - `server/handlers/MessageHandler.js:93` – `hit` 수신 → `CombatSystem.handlePlayerHit(...)`
  - `server/game/CombatSystem.js:11` – 피해 적용 및 `player-hit` 브로드캐스트 (`victimHealth` 포함)
  - `client/network/SocketManager.ts:205` – `player-hit` 수신 → 클라이언트 HUD 동기화 콜백 호출
- 1인칭(콕핏) 카메라 전환 + 성능 폴백
  - `client/components/MultiplayerScene.ts:91` – 사격 입력 시 1인칭 시작/종료 시각 설정
  - `client/components/MultiplayerScene.ts:325` – 1인칭 유지 여부 계산
  - `client/components/MultiplayerScene.ts:374` – 1인칭 FOV(65)로 전환, 부하 시 즉시 적용
  - `client/components/MultiplayerScene.ts:384` – 3인칭 복귀 시 위치 보간/즉시 전환
- 로컬 기체 숨김 처리 (1인칭 동안)
  - `client/components/MultiplayerScene.ts:326` – `this.localPlane.visible = !inFirstPerson;`
- CSS 크로스헤어
  - `client/components/MultiplayerScene.ts:404` – 크로스헤어 DOM 생성
  - `client/index.html:88` – `#crosshair` 애니메이션/스타일 정의

## 파라미터 튜닝 안내
- 카메라/전환
  - 1인칭 유지 시간: `client/components/MultiplayerScene.ts:48` (`fpDurationMs`)
  - 전환 시간: `client/components/MultiplayerScene.ts:49` (`fpTransitionMs`)
  - 기본/1인칭 FOV: `client/components/MultiplayerScene.ts:50`, `:51`
  - 콕핏 오프셋: `client/components/MultiplayerScene.ts:52`
    - 오프셋은 기체 로컬 좌표 기준(X:좌/우, Y:위/아래, Z:앞/뒤). 전방은 -Z
    - 기체가 보이지 않게 하려면 z를 더 작은 음수(예: `-2.5`)로 조정
- 카메라 흔들림
  - 사격 흔들림 지속: `client/components/MultiplayerScene.ts:55` (`shootShakeDuration`)
  - 흔들림 세기: `client/components/MultiplayerScene.ts:56` (`shakeAmplitude`)
- 무기/사격
  - 연사 쿨다운: `client/components/weapons/WeaponSystem.ts` 내 `shotCooldown`
  - 최대 사거리: `client/components/weapons/WeaponSystem.ts` 내 `maxShotRange`
  - 탄약/재장전: `client/components/weapons/WeaponSystem.ts` 내 `ammo`, `maxAmmo`, `reloadDuration`

## 동작 흐름 (사격 → 피해 동기화)
1) 사격 입력 시 1인칭 전환, 레이캐스트(화면 중앙)로 교차 검사 → 스프라이트 제외, 실제 메시 히트만 인정.
2) 맞은 오브젝트에서 부모 체인을 타고 플레이어 ID 탐색.
3) 클라이언트가 서버에 `hit` 전송 → 서버가 피해 적용 후 모든 클라이언트에 `player-hit` 브로드캐스트.
4) 내 클라이언트는 서버의 `victimHealth`로 HUD를 동기화하고 피격/사망 효과 처리.

## 성능 폴백
- 프레임 시간이 50ms(≈20FPS) 이상일 때:
  - 1인칭/3인칭 전환을 보간 없이 즉시 적용
  - FOV 전환도 즉시 적용
  - 카메라 흔들림 비활성화

## 테스트 체크리스트
- [ ] 화면 중앙 크로스헤어와 실제 히트 판정 일치 여부
- [ ] 원격 기체에 사격 시 서버 콘솔 `player-hit` 로그 및 HUD 체력 동기화 확인
- [ ] 이름표(스프라이트)는 히트로 인정되지 않는지 확인
- [ ] 1인칭 전환 0.25s, 유지 3s 정상 동작 및 성능 저하 시 즉시 전환 확인
- [ ] 1인칭 유지 동안 로컬 기체 렌더 숨김 처리 확인
- [ ] 사격/가속 시 카메라 흔들림이 과하지 않고 성능 저하 시 비활성화되는지 확인

## 향후 개선 아이디어(선택)
- 이름표 전용 레이어 분리 후 레이캐스터 대상 레이어에서 제외(더 견고한 필터링)
- 메시 히트 정밀도 튜닝(얇은 메시 보강을 위한 Raycaster params)
- 카메라 흔들림을 입력/속도 기반으로 더 정교하게 조정

---
문의나 수치 튜닝 요청은 `MultiplayerScene.ts`와 `WeaponSystem.ts`의 위 파라미터를 기준으로 알려주세요.


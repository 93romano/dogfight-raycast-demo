# Code Review & Cleanup (2026-04-07)

## 개요

클라이언트 코드 전반에 대한 코드 리뷰(Reuse / Quality / Efficiency)를 수행하고, 발견된 버그 및 성능 이슈를 수정함.

## 수정 내역

### 1. RemotePlayerManager — setTimeout 미추적 버그 수정

- **파일**: `client/components/players/RemotePlayerManager.ts`
- **문제**: `showHitEffect()`에서 `window.setTimeout()`을 사용하지만 타임아웃 ID를 추적하지 않아, `dispose()` 호출 후에도 콜백이 실행될 수 있는 메모리 누수 버그
- **수정**: `timeouts` Set을 추가하고, `scheduleTimeout()` 헬퍼를 통해 모든 타임아웃을 추적. `dispose()` 시 남은 타임아웃을 모두 정리. 콜백 내에서 플레이어 존재 여부도 확인하도록 가드 추가

### 2. PlayerIdInput — AbortController 시그널 누락 수정

- **파일**: `client/components/PlayerIdInput.ts`
- **문제**: `mouseenter`/`mouseleave` 이벤트 리스너에 `{ signal: this.abortController.signal }` 옵션이 빠져 있어, `hide()` 또는 `dispose()` 호출 시 해당 리스너가 정리되지 않음
- **수정**: 누락된 두 이벤트 리스너에 abort signal 추가

### 3. GameHud — 매 프레임 DOM 갱신 최적화

- **파일**: `client/components/ui/GameHud.ts`
- **문제**: `updateFrame()`, `updateInputStatus()`, `updateWeapon()`이 매 프레임(60fps 기준 초당 60회) 호출되며, 값 변경 여부와 관계없이 `.textContent`와 `.style` 속성을 무조건 갱신 -> 불필요한 브라우저 레이아웃 재계산 유발
- **수정**:
  - `updateFrame()`: speed, position 텍스트를 이전 값과 비교 후 변경 시에만 DOM 갱신
  - `updateInputStatus()`: 이전 활성 키셋과 비교하여 변경된 키만 className 갱신
  - `updateWeapon()`: 무기 상태를 문자열 키로 직렬화하여 이전 상태와 비교 후 변경 시에만 전체 갱신

### 4. MultiplayerScene — 카메라 업데이트 Vector3 할당 최적화

- **파일**: `client/components/MultiplayerScene.ts`
- **문제**: `updateFirstPersonCamera()`와 `updateThirdPersonCamera()`에서 매 프레임 5~9개의 `new THREE.Vector3()` 객체를 생성하여 GC 부담 증가
- **수정**: `_scratchOffset`, `_scratchTarget`, `_scratchJitter` 3개의 스크래치 벡터를 인스턴스 변수로 사전 할당하고, `.copy()`/`.set()` 메서드로 재사용

## 리뷰에서 확인했으나 수정하지 않은 항목

| 항목 | 사유 |
|------|------|
| `createBasicPlane` 중복 (MultiplayerScene, RemotePlayerManager) | 모델 로딩 실패 시 사용하는 폴백 코드로, 실행 빈도가 낮아 추상화 대비 이점이 적음 |
| `scheduleTimeout` 중복 (WeaponSystem, GameHud, RemotePlayerManager) | 각 7줄 수준의 간단한 헬퍼로, 별도 유틸리티 모듈 추가 시 오히려 복잡도 증가 |
| 색상 상수 하드코딩 (`#4CAF50` 등) | UI 전용 값으로 영향 범위가 제한적이고, 테마 시스템 도입 전까지는 현 상태 유지가 적절 |
| `getPlayerMap()` 내부 Map 직접 노출 | WeaponSystem의 히트 판정에서 실시간 데이터가 필요하여 의도적인 설계 |

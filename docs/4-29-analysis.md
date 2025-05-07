# 멀티플레이어 FPS 게임 구현 분석

## 1. 아키텍처 개선사항

### 현재 구현
- 바이너리 프로토콜을 사용하는 원시 WebSocket 사용
- 클라이언트 측 예측 및 조정 구현
- 상태 보간 버퍼 구현
- 입력 순서를 위한 시퀀스 번호 사용

### 제안된 구현
- 더 높은 수준의 `SocketManager` 추상화 사용
- Three.js를 사용한 3D 렌더링에 중점
- 단순화된 상태 관리
- 명시적인 예측/조정 없음

## 2. 주요 차이점과 잠재적 문제

### 긍정적 측면
1. **더 나은 관심사 분리**
   - 네트워킹과 렌더링의 명확한 분리
   - 더 유지보수하기 쉬운 코드 구조
   - 3D 장면 관리의 더 나은 캡슐화

2. **향상된 시각적 표현**
   - 조명이 있는 적절한 3D 장면 설정
   - 더 나은 카메라 추적 동작
   - 더 정교한 플레이어 표현 (기본 도형 대신 3D 평면)

3. **더 나은 이벤트 처리**
   - 플레이어 관리를 위한 더 깔끔한 이벤트 시스템
   - 더 체계적인 플레이어 상태 업데이트
   - 더 나은 창 크기 조정 처리

### 심각한 문제점

1. **네트워크 최적화 부재**
   ```typescript
   // 현재 구현:
   private readonly BUFFER_SIZE = 3;
   private readonly TICK_RATE = 60;
   private readonly TICK_INTERVAL = 1000 / 60;
   
   // 제안된 구현 부족:
   - 프레임 레이트 제어 없음
   - 보간 버퍼 없음
   - 예측 시스템 없음
   ```

2. **지연 보상 부재**
   ```typescript
   // 현재 구현:
   private reconcileStates() {
     // 미확인 입력 재생
     const unconfirmedInputs = this.gameState.pendingInputs.filter(
       input => input.sequence > this.lastProcessedSequence
     );
   }
   
   // 제안된 구현:
   updateRemotePlayer(id: string, state: PlayerState) {
     const mesh = this.otherPlayers.get(id);
     if (mesh) {
       mesh.position.fromArray(state.position);
       mesh.quaternion.fromArray(state.rotation);
     }
   }
   ```

3. **입력 검증 부재**
   ```typescript
   // 현재 구현:
   if (sequence > player.lastInputSequence) {
     player.lastInputSequence = sequence;
     player.inputState = inputState;
   }
   
   // 제안된 구현에는 입력 검증이 없음
   ```

## 3. 권장 하이브리드 접근 방식

두 구현의 장점을 결합한 하이브리드 접근 방식을 권장합니다:

```typescript
export class MultiplayerScene {
  private networkManager: NetworkManager;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private localPlane: THREE.Mesh;
  private otherPlayers: Map<string, THREE.Mesh> = new Map();
  private lastUpdateTime: number = 0;
  private readonly TICK_RATE = 60;
  private readonly TICK_INTERVAL = 1000 / 60;

  constructor(canvas: HTMLCanvasElement) {
    // ... 기존 장면 설정 ...

    this.networkManager = new NetworkManager();
    this.networkManager.on('state-update', this.handleStateUpdate);
    this.networkManager.on('player-joined', this.handlePlayerJoined);
    this.networkManager.on('player-left', this.handlePlayerLeft);
  }

  private handleStateUpdate = (timestamp: number, states: Map<number, PlayerState>) => {
    const interpolatedState = this.networkManager.getInterpolatedState(timestamp);
    for (const [id, state] of interpolatedState) {
      if (id === this.networkManager.getLocalPlayerId()) continue;
      this.updateRemotePlayer(id, state);
    }
  };

  public update = (currentTime: number) => {
    // 고정 시간 단계 업데이트
    const deltaTime = currentTime - this.lastUpdateTime;
    if (deltaTime >= this.TICK_INTERVAL) {
      this.lastUpdateTime = currentTime;
      
      // 로컬 플레이어 업데이트
      this.updateLocalPlayer();
      
      // 서버에 상태 전송
      this.networkManager.sendInput(this.getInputState());
    }

    // 보간된 상태로 렌더링
    this.renderer.render(this.scene, this.camera);
  };

  private updateLocalPlayer() {
    // 물리 및 이동 적용
    this.localPlane.translateZ(-0.1);
    
    // 카메라 업데이트
    this.camera.position.copy(this.localPlane.position)
      .add(new THREE.Vector3(0, 2, 6));
    this.camera.lookAt(this.localPlane.position);
  }

  private getInputState(): number {
    // 현재 입력 상태를 바이너리 플래그로 변환
    let inputState = 0;
    // ... 입력 처리 ...
    return inputState;
  }
}
```

## 4. 필요한 추가 구성 요소

1. **물리 시스템**
   ```typescript
   class PhysicsSystem {
     update(deltaTime: number, state: PlayerState): PlayerState {
       // 물리 계산 적용
       // 충돌 처리
       // 속도 업데이트
       return newState;
     }
   }
   ```

2. **입력 시스템**
   ```typescript
   class InputSystem {
     private currentState: number = 0;
     
     update() {
       // 키보드/마우스 입력 처리
       // 입력 상태 플래그 업데이트
     }
     
     getState(): number {
       return this.currentState;
     }
   }
   ```

3. **상태 보간 시스템**
   ```typescript
   class StateInterpolationSystem {
     private buffer: Array<GameState> = [];
     
     interpolate(timestamp: number): GameState {
       // 보간할 상태 찾기
       // 보간 계수 계산
       // 보간된 상태 반환
     }
   }
   ```

## 5. 성능 고려사항

1. **메모리 사용량**
   - 현재: 플레이어 100명당 ~100MB
   - 제안: 3D 메시로 인해 더 높을 수 있음
   - 해결책: 메시를 위한 객체 풀링 구현

2. **CPU 사용량**
   - 현재: 네트워크 업데이트에 최적화
   - 제안: 3D 렌더링으로 인한 더 많은 CPU 사용
   - 해결책: LOD(Level of Detail) 시스템 구현

3. **네트워크 대역폭**
   - 현재: 최적화된 바이너리 프로토콜
   - 제안: 덜 효율적일 수 있음
   - 해결책: 바이너리 프로토콜 유지, 압축 추가

## 결론

제안된 구현은 더 나은 시각적 표현과 코드 구성을 제공하지만 중요한 네트워킹 최적화를 희생합니다. 다음과 같은 것을 권장합니다:

1. 현재 네트워킹 아키텍처 유지
2. 제안된 3D 렌더링 시스템 채택
3. 다음을 포함한 하이브리드 접근 방식 구현:
   - 고정 시간 단계 업데이트
   - 상태 보간
   - 입력 예측
   - 지연 보상
   - 성능을 위한 객체 풀링

이렇게 하면 부드러운 시각적 효과와 반응성 있는 게임플레이를 모두 얻을 수 있습니다. 
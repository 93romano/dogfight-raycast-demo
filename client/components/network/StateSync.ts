import * as THREE from 'three';
import { PlayerState, MovementEvent } from '../../network/SocketManager';

export interface SyncConfig {
  positionThreshold: number;
  rotationThreshold: number;
  updateInterval: number;
  movementEventInterval: number;
}

export class StateSync {
  private config: SyncConfig;
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private lastRotation: THREE.Quaternion = new THREE.Quaternion();
  private lastUpdateTime = 0;
  private lastMovementTime = 0;
  private lastInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
  };

  private onStateChange?: (state: PlayerState) => void;
  private onMovementEvent?: (event: MovementEvent) => void;

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = {
      positionThreshold: 0.5,
      rotationThreshold: 0.05,
      updateInterval: 100, // 10Hz
      movementEventInterval: 5000, // 5초
      ...config
    };
  }

  public setStateChangeCallback(callback: (state: PlayerState) => void): void {
    this.onStateChange = callback;
  }

  public setMovementEventCallback(callback: (event: MovementEvent) => void): void {
    this.onMovementEvent = callback;
  }

  public update(
    localPlane: THREE.Group,
    inputState: any,
    speed: number
  ): void {
    const now = performance.now();

    // 위치/회전 변경 체크
    this.checkPositionChange(localPlane, now);
    
    // 입력 상태 변경 체크
    this.checkInputChange(localPlane, inputState, speed, now);
  }

  private checkPositionChange(localPlane: THREE.Group, now: number): void {
    const positionChanged = localPlane.position.distanceTo(this.lastPosition) > this.config.positionThreshold;
    const rotationChanged = localPlane.quaternion.angleTo(this.lastRotation) > this.config.rotationThreshold;
    const timePassed = now - this.lastUpdateTime > this.config.updateInterval;

    if ((positionChanged || rotationChanged) && timePassed) {
      // 상태 업데이트
      this.lastPosition.copy(localPlane.position);
      this.lastRotation.copy(localPlane.quaternion);
      this.lastUpdateTime = now;

      if (this.onStateChange) {
        this.onStateChange({
          position: localPlane.position.toArray(),
          rotation: localPlane.quaternion.toArray()
        });
      }
    }
  }

  private checkInputChange(
    localPlane: THREE.Group, 
    inputState: any, 
    speed: number, 
    now: number
  ): void {
    // 입력 상태가 변경되었는지 확인
    const inputChanged = 
      inputState.forward !== this.lastInputState.forward ||
      inputState.backward !== this.lastInputState.backward ||
      inputState.left !== this.lastInputState.left ||
      inputState.right !== this.lastInputState.right ||
      inputState.up !== this.lastInputState.up ||
      inputState.down !== this.lastInputState.down;

    const timePassed = now - this.lastMovementTime > this.config.movementEventInterval;

    if (timePassed) {
      // 움직임 이벤트 전송
      this.lastInputState = { ...inputState };
      this.lastMovementTime = now;

      if (this.onMovementEvent) {
        this.onMovementEvent({
          type: 'movement',
          input: {
            forward: inputState.forward,
            backward: inputState.backward,
            left: inputState.left,
            right: inputState.right,
            up: inputState.up,
            down: inputState.down,
            roll: 0 // InputManager에서 처리됨
          },
          position: localPlane.position.toArray(),
          rotation: localPlane.quaternion.toArray(),
          speed: speed
        });
      }
    }
  }

  public getConfig(): SyncConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

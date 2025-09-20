import * as THREE from 'three';

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  shoot: boolean;
}

export class InputManager {
  private keys: Set<string> = new Set();
  private isPointerLocked = false;
  private mouseSensitivity = 0.002;
  
  // 회전 값들
  private targetPitch = 0;
  private targetYaw = 0;
  private targetRoll = 0;
  
  // 롤 관성
  private rollSpeed = 0;
  private readonly rollAccel = 0.001;
  private readonly rollFriction = 0.95;
  
  // 이벤트 콜백
  private onShootCallback?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.initPointerLock(canvas);
    this.initEvents();
  }

  private initPointerLock(canvas: HTMLCanvasElement) {
    document.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });

    // document.addEventListener('mousemove', (event) => {
    //   if (this.isPointerLocked) {
    //     this.targetYaw -= event.movementX * this.mouseSensitivity;
    //     this.targetPitch -= event.movementY * this.mouseSensitivity;
        
    //     const pitchLimit = Math.PI / 2 - 0.01;
    //     this.targetPitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.targetPitch));
    //   }
    // });
  }

  private initEvents() {
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    
    // 스페이스 키로 사격
    document.addEventListener('keydown', (event) => {
      if (this.isPointerLocked && this.onShootCallback && event.code === 'Space') {
        this.onShootCallback();
      } 
    });
  }

  public setOnShootCallback(callback: () => void) {
    this.onShootCallback = callback;
  }

  public getCurrentInputState(): InputState {
    return {
      forward: this.keys.has('KeyW'),
      backward: this.keys.has('KeyS'),
      left: this.keys.has('KeyA'),
      right: this.keys.has('KeyD'),
      up: this.keys.has('ArrowUp'),
      down: this.keys.has('ArrowDown'),
      shoot: false // 마우스 클릭은 이벤트로 처리
    };
  }

  public updateRotation(): { pitch: number; yaw: number; roll: number } {
    // 롤 관성 적용
    if (this.keys.has('KeyA')) {
      this.rollSpeed += this.rollAccel;
    } else if (this.keys.has('KeyD')) {
      this.rollSpeed -= this.rollAccel;
    } else {
      this.rollSpeed *= this.rollFriction;
      // 롤 입력이 없고, 롤 속도가 거의 0이면 targetRoll을 0으로 서서히 복원
      if (Math.abs(this.rollSpeed) < 0.0001) {
        this.targetRoll = THREE.MathUtils.lerp(this.targetRoll, 0, 0.1);
        if (Math.abs(this.targetRoll) < 0.001) this.targetRoll = 0;
      }
    }
    this.targetRoll += this.rollSpeed;

    // 요 (키보드 화살표)
    if (this.keys.has('ArrowLeft')) this.targetYaw += 0.03;
    if (this.keys.has('ArrowRight')) this.targetYaw -= 0.03;

    // 피치 (키보드 화살표)
    if (this.keys.has('ArrowUp')) this.targetPitch -= 0.03;
    if (this.keys.has('ArrowDown')) this.targetPitch += 0.03;

    return {
      pitch: this.targetPitch,
      yaw: this.targetYaw,
      roll: this.targetRoll
    };
  }

  public getIsPointerLocked(): boolean {
    return this.isPointerLocked;
  }

  public getActiveKeys(): Set<string> {
    return new Set(this.keys);
  }
}

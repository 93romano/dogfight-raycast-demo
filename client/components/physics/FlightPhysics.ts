import * as THREE from 'three';
import { PhysicsState } from './types';
import { InputState } from '../input/InputManager';

export class FlightPhysics {
  private physics: PhysicsState = {
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    lift: 0,
    drag: 0
  };

  private speed = 0;
  private readonly minSpeed = 0;
  private readonly maxSpeed = 700;
  private readonly accel = 5;
  private readonly decel = 3;

  // 회전 값들
  private pitch = 0;
  private yaw = 0;
  private roll = 0;
  private readonly lerpFactor = 0.5;

  public updatePhysics(
    deltaTime: number, 
    inputState: InputState, 
    targetRotation: { pitch: number; yaw: number; roll: number },
    aircraft: THREE.Group
  ) {
    // 속도 업데이트
    this.updateSpeed(inputState);
    
    // 회전 보간
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetRotation.pitch, this.lerpFactor);
    this.yaw = THREE.MathUtils.lerp(this.yaw, targetRotation.yaw, this.lerpFactor);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRotation.roll, this.lerpFactor);
    
    // 속도 보간
    this.physics.velocity.z = THREE.MathUtils.lerp(this.physics.velocity.z, this.speed, 0.1);

    // 회전 적용
    const rotation = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    aircraft.quaternion.setFromEuler(rotation);

    // 이동 적용
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
    aircraft.position.add(direction.multiplyScalar(this.physics.velocity.z * deltaTime));

    // Y축 하한선 제한 (예: y >= 2)
    if (aircraft.position.y < 2) {
      aircraft.position.y = 2;
    }
  }

  private updateSpeed(inputState: InputState) {
    if (inputState.forward) {
      this.speed += this.accel;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    } else if (inputState.backward) {
      this.speed -= this.decel;
      if (this.speed < this.minSpeed) this.speed = this.minSpeed;
    } else {
      const friction = 0.99;
      this.speed *= friction;
      if (Math.abs(this.speed) < 0.01) this.speed = 0;
    }
  }

  public getSpeed(): number {
    return this.physics.velocity.length();
  }

  public getPhysicsState(): PhysicsState {
    return { ...this.physics };
  }

  public getCurrentSpeed(): number {
    return this.speed;
  }
}


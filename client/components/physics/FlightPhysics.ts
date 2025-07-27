import * as THREE from 'three';

export interface PhysicsState {
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  lift: number;
  drag: number;
}

export interface FlightInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export class FlightPhysics {
  private speed = 0;
  private readonly minSpeed = 0;
  private readonly maxSpeed = 700;
  private readonly accel = 5;
  private readonly decel = 3;

  private pitch = 0;
  private yaw = 0;
  private roll = 0;
  
  private targetPitch = 0;
  private targetYaw = 0;
  private targetRoll = 0;
  
  private rollSpeed = 0;
  private readonly rollAccel = 0.001;
  private readonly rollFriction = 0.95;
  
  private lerpFactor = 0.5;

  public updatePhysics(deltaTime: number, plane: THREE.Group, input: FlightInput) {
    this.handleInput(input);
    this.applyPhysics(deltaTime, plane);
  }

  private handleInput(input: FlightInput) {
    // 가속/감속
    if (input.forward) {
      this.speed += this.accel;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    } else if (input.backward) {
      this.speed -= this.decel;
      if (this.speed < this.minSpeed) this.speed = this.minSpeed;
    } else {
      const friction = 0.99;
      this.speed *= friction;
      if (Math.abs(this.speed) < 0.01) this.speed = 0;
    }

    // 롤 관성 적용
    if (input.left) {
      this.rollSpeed += this.rollAccel;
    } else if (input.right) {
      this.rollSpeed -= this.rollAccel;
    } else {
      this.rollSpeed *= this.rollFriction;
      if (Math.abs(this.rollSpeed) < 0.0001) {
        this.targetRoll = THREE.MathUtils.lerp(this.targetRoll, 0, 0.1);
        if (Math.abs(this.targetRoll) < 0.001) this.targetRoll = 0;
      }
    }
    this.targetRoll += this.rollSpeed;
  }

  private applyPhysics(deltaTime: number, plane: THREE.Group) {
    // 목표값 → 실제값 보간
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, this.lerpFactor);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, this.lerpFactor);
    this.roll = THREE.MathUtils.lerp(this.roll, this.targetRoll, this.lerpFactor);

    // 회전 적용
    const rotation = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    plane.quaternion.setFromEuler(rotation);

    // 이동 적용
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(plane.quaternion);
    plane.position.add(direction.multiplyScalar(this.speed * deltaTime));

    // Y축 하한선 제한
    if (plane.position.y < 2) {
      plane.position.y = 2;
    }
  }

  public getSpeed(): number {
    return this.speed;
  }

  public getPosition(): THREE.Vector3 {
    return new THREE.Vector3();
  }

  public setTargetPitch(value: number) {
    this.targetPitch = value;
  }

  public setTargetYaw(value: number) {
    this.targetYaw = value;
  }

  public setTargetRoll(value: number) {
    this.targetRoll = value;
  }
} 
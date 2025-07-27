import * as THREE from 'three';

export interface PhysicsState {
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  lift: number;
  drag: number;
}


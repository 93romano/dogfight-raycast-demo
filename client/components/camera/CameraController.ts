import * as THREE from 'three';

export interface CameraState {
  position: THREE.Vector3;
  lookAtTarget: THREE.Vector3;
  quaternion: THREE.Quaternion;
  euler: THREE.Euler;
  followMode: boolean;
  lookAtMode: boolean;
  // 사용자가 설정한 원본 Euler 각도 추가
  userEuler: THREE.Euler;
}

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private followMode = true;
  private lookAtMode = true;
  private lookAtTarget = new THREE.Vector3(0, 0, 0);
  
  // 내부 계산용 Euler (Quaternion에서 변환된 값)
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  
  // 사용자가 직접 입력한 원본 Euler 값 (UI 표시용)
  private userEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  
  private updateDisplayCallback: (() => void) | null = null;
  private isQuaternionMode = false; // 현재 Quaternion 모드인지 추적

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public setFollowMode(enabled: boolean) {
    this.followMode = enabled;
    console.log(`🎥 Follow mode: ${enabled ? 'ON' : 'OFF'}`);
    this.updateDisplay();
  }

  public setLookAtMode(enabled: boolean) {
    this.lookAtMode = enabled;
    console.log(`🎯 LookAt mode: ${enabled ? 'ON' : 'OFF'}`);
    
    // LookAt 모드로 전환 시 Quaternion 모드 해제
    if (enabled) {
      this.isQuaternionMode = false;
    }
    
    this.updateDisplay();
  }

  public setPosition(axis: 'x' | 'y' | 'z', value: number) {
    if (this.followMode) {
      console.log('📍 Manual position adjustment - disabling follow mode');
      this.followMode = false;
    }
    
    switch (axis) {
      case 'x':
        this.camera.position.x = value;
        break;
      case 'y':
        this.camera.position.y = value;
        break;
      case 'z':
        this.camera.position.z = value;
        break;
    }
    
    if (this.lookAtMode && !this.isQuaternionMode) {
      this.camera.lookAt(this.lookAtTarget);
    }
    
    this.updateDisplay();
  }

  public setLookAtTarget(axis: 'x' | 'y' | 'z', value: number) {
    console.log(`🎯 Setting lookAt target ${axis}: ${value}`);
    
    switch (axis) {
      case 'x':
        this.lookAtTarget.x = value;
        break;
      case 'y':
        this.lookAtTarget.y = value;
        break;
      case 'z':
        this.lookAtTarget.z = value;
        break;
    }
    
    if (!this.lookAtMode) {
      console.log('🎯 Enabling lookAt mode');
      this.lookAtMode = true;
    }
    
    this.isQuaternionMode = false; // LookAt 사용 시 Quaternion 모드 해제
    this.camera.lookAt(this.lookAtTarget);
    this.updateDisplay();
  }

  public setQuaternion(axis: 'x' | 'y' | 'z', value: number) {
    console.log(`🔄 Setting quaternion ${axis}: ${value}°`);
    
    // Quaternion 직접 제어 시 LookAt 모드 비활성화
    if (this.lookAtMode) {
      console.log('🔄 Disabling lookAt mode for quaternion control');
      this.lookAtMode = false;
    }
    
    this.isQuaternionMode = true;
    const radians = value * Math.PI / 180;
    
    switch (axis) {
      case 'x':
        this.userEuler.x = radians;
        break;
      case 'y':
        this.userEuler.y = radians;
        break;
      case 'z':
        this.userEuler.z = radians;
        break;
    }
    
    // 사용자 입력값을 직접 카메라에 적용
    this.camera.quaternion.setFromEuler(this.userEuler);
    this.updateDisplay();
  }

  public followTarget(targetPosition: THREE.Vector3, offset: THREE.Vector3, lerpFactor: number) {
    if (!this.followMode) return;
    
    const offsetWithRotation = offset.clone().applyQuaternion(this.camera.quaternion);
    const targetCameraPos = targetPosition.clone().add(offsetWithRotation);
    this.camera.position.lerp(targetCameraPos, lerpFactor);
    
    if (this.lookAtMode && !this.isQuaternionMode) {
      const defaultTarget = targetPosition;
      const hasCustomTarget = !this.lookAtTarget.equals(new THREE.Vector3(0, 0, 0));
      
      if (hasCustomTarget) {
        this.camera.lookAt(this.lookAtTarget);
      } else {
        this.camera.lookAt(defaultTarget);
      }
    }
  }

  public getState(): CameraState {
    // Quaternion 모드일 때는 사용자가 입력한 원본 값 사용
    // 그 외에는 현재 카메라의 Quaternion에서 Euler 계산
    let displayEuler: THREE.Euler;
    
    if (this.isQuaternionMode) {
      displayEuler = this.userEuler.clone();
    } else {
      displayEuler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    }
    
    return {
      position: this.camera.position.clone(),
      lookAtTarget: this.lookAtTarget.clone(),
      quaternion: this.camera.quaternion.clone(),
      euler: displayEuler,
      followMode: this.followMode,
      lookAtMode: this.lookAtMode,
      userEuler: this.userEuler.clone()
    };
  }

  public setUpdateDisplayCallback(callback: () => void) {
    this.updateDisplayCallback = callback;
  }

  private updateDisplay() {
    if (this.updateDisplayCallback) {
      this.updateDisplayCallback();
    }
  }

  public isFollowMode(): boolean {
    return this.followMode;
  }

  public isLookAtMode(): boolean {
    return this.lookAtMode;
  }

  public getLookAtTarget(): THREE.Vector3 {
    return this.lookAtTarget.clone();
  }

  public isInQuaternionMode(): boolean {
    return this.isQuaternionMode;
  }
} 
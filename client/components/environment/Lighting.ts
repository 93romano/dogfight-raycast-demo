import * as THREE from 'three';

export interface LightingConfig {
  sunColor?: number;
  sunIntensity?: number;
  sunPosition?: THREE.Vector3;
  ambientColor?: number;
  ambientIntensity?: number;
  enableShadows?: boolean;
}

export class Lighting {
  private scene: THREE.Scene;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public initialize(config: LightingConfig = {}) {
    const {
      sunColor = 0xffffff,
      sunIntensity = 1,
      sunPosition = new THREE.Vector3(5, 10, 7),
      ambientColor = 0x888888,
      ambientIntensity = 1,
      enableShadows = true
    } = config;

    // 태양광 (방향성 조명)
    this.sunLight = new THREE.DirectionalLight(sunColor, sunIntensity);
    this.sunLight.position.copy(sunPosition);
    
    if (enableShadows) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 0.5;
      this.sunLight.shadow.camera.far = 500;
    }
    
    this.scene.add(this.sunLight);

    // 환경광 (전체 조명)
    this.ambientLight = new THREE.AmbientLight(ambientColor, ambientIntensity);
    this.scene.add(this.ambientLight);
  }

  public setSunPosition(position: THREE.Vector3) {
    if (this.sunLight) {
      this.sunLight.position.copy(position);
    }
  }

  public setSunIntensity(intensity: number) {
    if (this.sunLight) {
      this.sunLight.intensity = intensity;
    }
  }

  public setAmbientIntensity(intensity: number) {
    if (this.ambientLight) {
      this.ambientLight.intensity = intensity;
    }
  }

  public getSunLight(): THREE.DirectionalLight | null {
    return this.sunLight;
  }

  public getAmbientLight(): THREE.AmbientLight | null {
    return this.ambientLight;
  }
}


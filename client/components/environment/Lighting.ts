import * as THREE from 'three';

export interface LightingConfig {
  sunColor?: number;
  sunIntensity?: number;
  sunPosition?: THREE.Vector3;
  ambientColor?: number;
  ambientIntensity?: number;
  skyColor?: number;
  groundColor?: number;
  hemisphereIntensity?: number;
  enableShadows?: boolean;
}

export class Lighting {
  private scene: THREE.Scene;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public initialize(config: LightingConfig = {}) {
    const {
      // cool, moody key light to match the night-navy / cyan art direction
      sunColor = 0xcfe3ff,
      sunIntensity = 2.4,
      sunPosition = new THREE.Vector3(8, 14, 6),
      ambientColor = 0x2a3a58,
      ambientIntensity = 0.5,
      skyColor = 0x6a8fc0,
      groundColor = 0x10172a,
      hemisphereIntensity = 1.1,
      enableShadows = true
    } = config;

    // 태양광 (방향성 조명) — cool key light
    this.sunLight = new THREE.DirectionalLight(sunColor, sunIntensity);
    this.sunLight.position.copy(sunPosition);

    if (enableShadows) {
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 0.5;
      this.sunLight.shadow.camera.far = 120;
      const frustum = 20;
      this.sunLight.shadow.camera.left = -frustum;
      this.sunLight.shadow.camera.right = frustum;
      this.sunLight.shadow.camera.top = frustum;
      this.sunLight.shadow.camera.bottom = -frustum;
      this.sunLight.shadow.bias = -0.0005;
    }

    this.scene.add(this.sunLight);
    // target must be in the scene graph so its world matrix (and the shadow
    // camera that aims at it) updates when we move it to follow the aircraft
    this.scene.add(this.sunLight.target);

    // 하늘/지면 그라데이션 환경광
    this.hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, hemisphereIntensity);
    this.scene.add(this.hemisphereLight);

    // 환경광 (전체 베이스 밝기)
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


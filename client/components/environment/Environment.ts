import * as THREE from 'three';
import { Skybox } from './Skybox';
import { Lighting } from './Lighting';

export class Environment {
  private scene: THREE.Scene;
  private skybox: Skybox;
  private lighting: Lighting;
  private clouds: THREE.Group[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.skybox = new Skybox(scene);
    this.lighting = new Lighting(scene);
  }

  public async initialize(): Promise<void> {
    // 스카이박스 로드
    try {
      await this.skybox.loadValleySkybox();
    } catch (error) {
      console.warn('Failed to load skybox, using solid color');
      this.skybox.setSolidColor(0x87ceeb); // 하늘색
    }

    // 조명 설정
    this.lighting.initialize({
      sunPosition: new THREE.Vector3(5, 10, 7),
      enableShadows: true
    });

    // 구름 생성
    this.generateClouds(20);
  }

  private generateClouds(count: number) {
    for (let i = 0; i < count; i++) {
      const cloud = this.createCloud();
      cloud.position.set(
        Math.random() * 1000 - 500,
        Math.random() * 100 + 50,
        Math.random() * 1000 - 500
      );
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  private createCloud(): THREE.Group {
    const group = new THREE.Group();
    const geometry = new THREE.SphereGeometry(1, 8, 8);
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8
    });

    for (let i = 0; i < 3; i++) {
      const cloud = new THREE.Mesh(geometry, material);
      cloud.position.set(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      );
      cloud.scale.set(
        Math.random() * 2 + 2,
        Math.random() * 2 + 2,
        Math.random() * 2 + 2
      );
      group.add(cloud);
    }

    return group;
  }

  public updateClouds(deltaTime: number) {
    // 구름 애니메이션 (천천히 움직임)
    this.clouds.forEach((cloud, index) => {
      cloud.rotation.y += deltaTime * 0.1;
      
      // 구름이 너무 멀리 가면 다시 리셋
      if (cloud.position.x > 600) {
        cloud.position.x = -600;
      } else {
        cloud.position.x += deltaTime * 5; // 천천히 이동
      }
    });
  }

  public getSkybox(): Skybox {
    return this.skybox;
  }

  public getLighting(): Lighting {
    return this.lighting;
  }

  public setCloudsVisibility(visible: boolean) {
    this.clouds.forEach(cloud => {
      cloud.visible = visible;
    });
  }

  public getCloudCount(): number {
    return this.clouds.length;
  }
}
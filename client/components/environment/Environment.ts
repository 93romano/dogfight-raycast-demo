import * as THREE from 'three';
import { Lighting } from './Lighting';
import { Background } from './Background';

export class Environment {
  private scene: THREE.Scene;
  private background: Background;
  private lighting: Lighting;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.background = new Background(scene);
    this.lighting = new Lighting(scene);    
  }

  public async initialize(): Promise<void> {
    await this.background.initialize();

    // 조명 설정 (Lighting의 cool/moody 기본값 사용)
    this.lighting.initialize({
      sunPosition: new THREE.Vector3(8, 14, 6),
      enableShadows: true
    });
  }

  public dispose(): void {
    this.background.dispose();
  }


  public getBackground(): Background {
    return this.background;
  }

  public getLighting(): Lighting {
    return this.lighting;
  }
}
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

    // 조명 설정
    this.lighting.initialize({
      sunPosition: new THREE.Vector3(5, 10, 7),
      enableShadows: true
    });

  }


  public getBackground(): Background {
    return this.background;
  }

  public getLighting(): Lighting {
    return this.lighting;
  }
}
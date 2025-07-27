import * as THREE from 'three';

export class Skybox {
  private scene: THREE.Scene;
  private skybox: THREE.CubeTexture | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public async loadValleySkybox(): Promise<void> {
    const loader = new THREE.CubeTextureLoader();
    
    return new Promise((resolve, reject) => {
      this.skybox = loader.setPath('/assets/skybox/').load([
        'valley_ft.jpg', // +X
        'valley_bk.jpg', // -X
        'valley_up.jpg', // +Y
        'valley_dn.jpg', // -Y
        'valley_rt.jpg', // +Z
        'valley_lf.jpg', // -Z
      ], 
      () => {
        if (this.skybox) {
          this.skybox.colorSpace = THREE.SRGBColorSpace;
          this.scene.background = this.skybox;
        }
        resolve();
      },
      undefined,
      (error) => {
        console.error('Failed to load skybox:', error);
        reject(error);
      });
    });
  }

  public setSolidColor(color: number): void {
    this.scene.background = new THREE.Color(color);
  }

  public getSkybox(): THREE.CubeTexture | null {
    return this.skybox;
  }
}


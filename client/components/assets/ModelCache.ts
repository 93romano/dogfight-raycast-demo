import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export class ModelCache {
  private readonly loader = new GLTFLoader();
  private jetTemplatePromise: Promise<THREE.Group> | null = null;

  public async createJetInstance(): Promise<THREE.Group> {
    const template = await this.getJetTemplate();
    const instance = cloneSkeleton(template) as THREE.Group;

    instance.userData.usesSharedGeometry = true;
    this.cloneMaterials(instance);

    return instance;
  }

  private async getJetTemplate(): Promise<THREE.Group> {
    if (!this.jetTemplatePromise) {
      this.jetTemplatePromise = this.loader.loadAsync('/assets/models/Jet.glb').then((gltf) => {
        const plane = gltf.scene as THREE.Group;
        plane.scale.set(0.5, 0.5, 0.5);
        plane.position.set(0, 0, 0);

        if (plane.children[0]) {
          plane.children[0].rotation.y = Math.PI;
        }

        return plane;
      });
    }

    return this.jetTemplatePromise;
  }

  private cloneMaterials(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) {
        return;
      }

      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
        return;
      }

      child.material = child.material.clone();
    });
  }
}

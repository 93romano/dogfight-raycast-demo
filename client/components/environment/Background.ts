import * as THREE from 'three';

export class Background {
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    public async initialize() {
     this.scene.background = new THREE.Color(0x000000);
    }
}
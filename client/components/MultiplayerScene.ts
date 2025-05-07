// client/components/MultiplayerScene.ts

import * as THREE from 'three';
import { SocketManager, PlayerState } from '../network/SocketManager';

export class MultiplayerScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private localPlane: THREE.Mesh;
  private otherPlayers: Map<string, THREE.Mesh> = new Map();
  private socket: SocketManager;

  private keys: Set<string> = new Set();
  private isPointerLocked = false;
  private mouseSensitivity = 0.002;

  private pitch = 0;
  private yaw = 0;
  private roll = 0;
  private speed = 0.1;
  private readonly minSpeed = 0;
  private readonly maxSpeed = 2.0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x222222);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 3, 8);

    this.renderer = new THREE.WebGLRenderer({ canvas });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.localPlane = this.createPlane(0x3399ff);
    this.scene.add(this.localPlane);

    this.initLights();
    this.initSocket();
    this.initPointerLock();
    this.initEvents();

    window.addEventListener('resize', this.onResize);
  }

  private initLights() {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x888888));
  }

  private createPlane(color: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 0.3, 3);
    const material = new THREE.MeshPhongMaterial({ color });
    return new THREE.Mesh(geometry, material);
  }

  private initSocket() {
    this.socket = new SocketManager(
      (id, state) => this.addRemotePlayer(id, state),
      (id, state) => this.updateRemotePlayer(id, state),
      (id) => this.removeRemotePlayer(id),
      (allPlayers) => {
        for (const id in allPlayers) {
          if (id !== this.socket.getSocketId()) {
            this.addRemotePlayer(id, allPlayers[id]);
          }
        }
      }
    );
  }

  private initPointerLock() {
    document.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    document.addEventListener('mousemove', (event) => {
      if (this.isPointerLocked) {
        this.yaw -= event.movementX * this.mouseSensitivity;
        this.pitch -= event.movementY * this.mouseSensitivity;
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
      }
    });
  }

  private initEvents() {
    document.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  private addRemotePlayer(id: string, state: PlayerState) {
    const mesh = this.createPlane(0xff4444);
    mesh.position.fromArray(state.position);
    mesh.quaternion.fromArray(state.rotation);
    this.scene.add(mesh);
    this.otherPlayers.set(id, mesh);
  }

  private updateRemotePlayer(id: string, state: PlayerState) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      mesh.position.fromArray(state.position);
      mesh.quaternion.fromArray(state.rotation);
    }
  }

  private removeRemotePlayer(id: string) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.otherPlayers.delete(id);
    }
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public update = () => {
    if (this.keys.has('arrowleft')) this.roll += 0.03;
    if (this.keys.has('arrowright')) this.roll -= 0.03;
    if (this.keys.has('w')) this.speed += 0.01;
    if (this.keys.has('s')) this.speed -= 0.01;
    this.roll *= 0.95;
    this.speed = Math.max(this.minSpeed, Math.min(this.maxSpeed, this.speed));

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ')
    );
    this.localPlane.quaternion.copy(q);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.localPlane.quaternion);
    this.localPlane.position.add(forward.multiplyScalar(this.speed));

    this.camera.position.copy(this.localPlane.position).add(new THREE.Vector3(0, 2, 6));
    this.camera.lookAt(this.localPlane.position);

    this.socket.sendState({
      position: this.localPlane.position.toArray(),
      rotation: this.localPlane.quaternion.toArray()
    });

    this.renderer.render(this.scene, this.camera);
  };

  public getSpeed(): number {
    return this.speed;
  }

  public getPosition(): THREE.Vector3 {
    return this.localPlane.position.clone();
  }
}

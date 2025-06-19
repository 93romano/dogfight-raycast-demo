// client/scenes/MultiplayerScene.ts

import * as THREE from 'three';
import { SocketManager, PlayerState } from '../network/SocketManager';

export class MultiplayerScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  private localPlayer: THREE.Mesh;
  private remotePlayers: Map<string, THREE.Mesh> = new Map();

  private socket: SocketManager;

  private lastStateUpdate: number = 0;
  private stateUpdateInterval: number = 50; // 50ms

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.clock = new THREE.Clock();

    this.localPlayer = this.createPlayerMesh(0x3399ff);
    this.scene.add(this.localPlayer);

    this.setupLighting();
    this.setupSocket();

    window.addEventListener('resize', this.onWindowResize);
    this.animate();
  }

  private createPlayerMesh(color: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 0.3, 3);
    const material = new THREE.MeshStandardMaterial({ color });
    return new THREE.Mesh(geometry, material);
  }

  private setupLighting() {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  }

  private setupSocket() {
    this.socket = new SocketManager(
      (id, state) => this.addRemotePlayer(id, state),
      (id, state) => this.updateRemotePlayer(id, state),
      (id) => this.removeRemotePlayer(id),
      (allPlayers) => {
        for (const [id, state] of Object.entries(allPlayers)) {
          if (id !== this.socket.getSocketId()) {
            this.addRemotePlayer(id, state);
          }
        }
      }
    );

    setInterval(() => {
      console.log('client/scenes/MultiplayerScene.ts 🔌 sendState', this.localPlayer.position.toArray(), this.localPlayer.quaternion.toArray());
      const now = Date.now();
      if (now - this.lastStateUpdate >= this.stateUpdateInterval) {
        this.socket.sendState({
          position: this.localPlayer.position.toArray(),
          rotation: this.localPlayer.quaternion.toArray()
        });
        this.lastStateUpdate = now;
      }
    }, 50); // 20fps 주기
  }

  private addRemotePlayer(id: string, state: PlayerState) {
    const mesh = this.createPlayerMesh(0xff9933);
    mesh.position.fromArray(state.position);
    mesh.quaternion.fromArray(state.rotation);
    this.scene.add(mesh);
    this.remotePlayers.set(id, mesh);
  }

  private updateRemotePlayer(id: string, state: PlayerState) {
    const player = this.remotePlayers.get(id);
    if (player) {
      player.position.fromArray(state.position);
      player.quaternion.fromArray(state.rotation);
    }
  }

  private removeRemotePlayer(id: string) {
    const player = this.remotePlayers.get(id);
    if (player) {
      this.scene.remove(player);
      this.remotePlayers.delete(id);
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);

    // 간단한 로컬 움직임 (테스트용)
    const delta = this.clock.getDelta();
    this.localPlayer.position.z -= delta * 5; // 앞으로 계속 이동 (임시)

    this.camera.position.copy(this.localPlayer.position).add(new THREE.Vector3(0, 2, 6));
    this.camera.lookAt(this.localPlayer.position);

    this.renderer.render(this.scene, this.camera);
  };

  private onWindowResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public sendState(state: PlayerState) {
    this.socket.sendState(state);
  }
}

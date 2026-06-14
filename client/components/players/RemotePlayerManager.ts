import * as THREE from 'three';
import { MovementEvent, PlayerState } from '../../network/SocketManager';
import { ModelCache } from '../assets/ModelCache';
import { enableShadows } from '../assets/PlaneFactory';

export class RemotePlayerManager {
  private readonly players = new Map<string, THREE.Group>();
  private readonly timeouts = new Set<number>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly modelCache: ModelCache
  ) {}

  public getPlayerMap(): Map<string, THREE.Group> {
    return this.players;
  }

  public async addPlayer(id: string, state: PlayerState): Promise<void> {
    if (this.players.has(id)) {
      this.updatePlayer(id, state);
      return;
    }

    try {
      const mesh = await this.modelCache.createJetInstance();
      if (this.players.has(id)) {
        this.disposePlayerMesh(mesh);
        return;
      }

      this.tintPlayer(mesh, id);
      this.initializePlayerMesh(mesh, id, state);
      return;
    } catch (error) {
      console.error('Error loading remote player model:', error);
    }

    const fallbackMesh = this.createBasicPlane(0xff4444);
    fallbackMesh.userData.isFallbackPlane = true;
    this.initializePlayerMesh(fallbackMesh, id, state);
  }

  public updatePlayer(id: string, state: PlayerState, lerpFactor = 0.3): void {
    const mesh = this.players.get(id);
    if (!mesh) {
      return;
    }

    const targetPosition = new THREE.Vector3().fromArray(state.position);
    const targetQuaternion = new THREE.Quaternion().fromArray(state.rotation);

    mesh.position.lerp(targetPosition, lerpFactor);
    mesh.quaternion.slerp(targetQuaternion, lerpFactor);
  }

  public handleMovement(id: string, event: MovementEvent): void {
    this.updatePlayer(id, {
      position: event.position,
      rotation: event.rotation
    }, 0.4);
  }

  public removePlayer(id: string): void {
    const mesh = this.players.get(id);
    if (!mesh) {
      return;
    }

    this.scene.remove(mesh);
    this.disposePlayerMesh(mesh);
    this.players.delete(id);
  }

  public respawnPlayer(id: string, respawnPosition: number[]): void {
    const mesh = this.players.get(id);
    if (!mesh) {
      return;
    }

    mesh.position.fromArray(respawnPosition);
    mesh.quaternion.set(0, 0, 0, 1);
  }

  public showHitEffect(id: string): void {
    const playerMesh = this.players.get(id);
    if (!playerMesh) {
      return;
    }

    const originalColors: THREE.Color[] = [];

    playerMesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) {
        return;
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => {
          originalColors.push(material.color.clone());
          material.color.setHex(0xff0000);
        });
        return;
      }

      originalColors.push(child.material.color.clone());
      child.material.color.setHex(0xff0000);
    });

    this.scheduleTimeout(() => {
      if (!this.players.has(id)) {
        return;
      }

      let colorIndex = 0;

      playerMesh.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.material) {
          return;
        }

        if (Array.isArray(child.material)) {
          child.material.forEach((material) => {
            if (originalColors[colorIndex]) {
              material.color.copy(originalColors[colorIndex]);
              colorIndex++;
            }
          });
          return;
        }

        if (originalColors[colorIndex]) {
          child.material.color.copy(originalColors[colorIndex]);
          colorIndex++;
        }
      });
    }, 200);
  }

  public dispose(): void {
    this.timeouts.forEach((id) => window.clearTimeout(id));
    this.timeouts.clear();
    Array.from(this.players.keys()).forEach((id) => this.removePlayer(id));
  }

  private scheduleTimeout(callback: () => void, delayMs: number): void {
    const timeoutId = window.setTimeout(() => {
      this.timeouts.delete(timeoutId);
      callback();
    }, delayMs);
    this.timeouts.add(timeoutId);
  }

  private initializePlayerMesh(mesh: THREE.Group, id: string, state: PlayerState): void {
    enableShadows(mesh);

    mesh.position.fromArray(state.position);
    mesh.quaternion.fromArray(state.rotation);
    this.addPlayerLabel(mesh, id);

    this.scene.add(mesh);
    this.players.set(id, mesh);
  }

  private tintPlayer(mesh: THREE.Group, id: string): void {
    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];
    const color = colors[parseInt(id, 10) % colors.length];

    mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) {
        return;
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => {
          if (material.name.includes('Body') || material.name.includes('Fuselage')) {
            material.color.setHex(color);
          }
        });
        return;
      }

      if (child.material.name.includes('Body') || child.material.name.includes('Fuselage')) {
        child.material.color.setHex(color);
      }
    });
  }

  private addPlayerLabel(mesh: THREE.Group, id: string): void {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    canvas.width = 256;
    canvas.height = 64;

    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = 'white';
    context.font = '24px Arial';
    context.textAlign = 'center';
    context.fillText(`Player ${id}`, canvas.width / 2, canvas.height / 2 + 8);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);

    sprite.position.set(0, 3, 0);
    sprite.scale.set(2, 0.5, 1);
    sprite.userData.isPlayerLabel = true;

    mesh.add(sprite);
  }

  private createBasicPlane(color: number): THREE.Group {
    const group = new THREE.Group();

    const fuselageGeometry = new THREE.CylinderGeometry(0.2, 0.2, 3, 8);
    const fuselageMaterial = new THREE.MeshPhongMaterial({ color });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.rotation.x = Math.PI / 2;
    group.add(fuselage);

    const wingGeometry = new THREE.BoxGeometry(4, 0.1, 1);
    const wingMaterial = new THREE.MeshPhongMaterial({ color });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    group.add(wings);

    const tailGeometry = new THREE.BoxGeometry(1, 0.1, 0.5);
    const tailMaterial = new THREE.MeshPhongMaterial({ color });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.set(0, 0.2, -1.5);
    group.add(tail);

    return group;
  }

  private disposePlayerMesh(mesh: THREE.Group): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Sprite) {
        if (child.material.map) {
          child.material.map.dispose();
        }
        child.material.dispose();
        return;
      }

      if (!(child instanceof THREE.Mesh) || !child.material) {
        return;
      }

      if (mesh.userData.isFallbackPlane) {
        child.geometry.dispose();
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
        return;
      }

      child.material.dispose();
    });
  }
}

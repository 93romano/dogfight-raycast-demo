import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PlayerState } from '../../network/SocketManager';

export class PlayerManager {
  private scene: THREE.Scene;
  private otherPlayers: Map<string, THREE.Group> = new Map();
  private loader: GLTFLoader;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
  }

  public async addRemotePlayer(id: string, state: PlayerState) {
    console.log(`🎮 Adding remote player ${id} at position:`, state.position);
    
    try {
      const gltf = await this.loader.loadAsync('assets/models/Jet.glb');
      const mesh = gltf.scene.clone();
      
      // 다른 유저는 다른 색상으로 구분
      const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];
      const color = colors[parseInt(id) % colors.length];
      
      // 비행기 색상 변경
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat.name.includes('Body') || mat.name.includes('Fuselage')) {
                mat.color.setHex(color);
              }
            });
          } else {
            if (child.material.name.includes('Body') || child.material.name.includes('Fuselage')) {
              child.material.color.setHex(color);
            }
          }
        }
      });
      
      mesh.scale.set(0.5, 0.5, 0.5);
      mesh.position.fromArray(state.position);
      mesh.quaternion.fromArray(state.rotation);
      
      // 플레이어 ID 표시
      this.addPlayerLabel(mesh, id);
      
      this.scene.add(mesh);
      this.otherPlayers.set(id, mesh);
      
      console.log(`✅ Remote player ${id} added successfully`);
    } catch (error) {
      console.error('Error loading remote player model:', error);
      const mesh = this.createBasicPlane(0xff4444);
      mesh.position.fromArray(state.position);
      mesh.quaternion.fromArray(state.rotation);
      this.addPlayerLabel(mesh, id);
      this.scene.add(mesh);
      this.otherPlayers.set(id, mesh);
    }
  }

  public updateRemotePlayer(id: string, state: PlayerState) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      const targetPosition = new THREE.Vector3().fromArray(state.position);
      const targetQuaternion = new THREE.Quaternion().fromArray(state.rotation);
      
      mesh.position.lerp(targetPosition, 0.1);
      mesh.quaternion.slerp(targetQuaternion, 0.1);
      
      if (Math.random() < 0.01) {
        console.log(`🎮 Remote player ${id} updated:`, {
          position: targetPosition.toArray(),
          rotation: targetQuaternion.toArray()
        });
      }
    }
  }

  public removeRemotePlayer(id: string) {
    console.log(`🎮 Removing remote player ${id}`);
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.otherPlayers.delete(id);
    }
  }

  public showPlayerHitEffect(playerId: string) {
    const playerMesh = this.otherPlayers.get(playerId);
    if (!playerMesh) return;

    const originalColors: THREE.Color[] = [];
    
    playerMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat, index) => {
            originalColors.push(mat.color.clone());
            mat.color.setHex(0xff0000);
          });
        } else {
          originalColors.push(child.material.color.clone());
          child.material.color.setHex(0xff0000);
        }
      }
    });
    
    setTimeout(() => {
      let colorIndex = 0;
      playerMesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => {
              if (originalColors[colorIndex]) {
                mat.color.copy(originalColors[colorIndex]);
                colorIndex++;
              }
            });
          } else {
            if (originalColors[colorIndex]) {
              child.material.color.copy(originalColors[colorIndex]);
              colorIndex++;
            }
          }
        }
      });
    }, 200);
  }

  private addPlayerLabel(mesh: THREE.Group, id: string) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    
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

    group.castShadow = true;
    return group;
  }

  public getOtherPlayers(): Map<string, THREE.Group> {
    return this.otherPlayers;
  }
}
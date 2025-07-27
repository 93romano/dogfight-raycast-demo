import * as THREE from 'three';
import { VisualBullet } from './VisualBullet';

export class WeaponSystem {
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private lastShotTime = 0;
  private readonly shotCooldown = 500;
  private readonly maxShotRange = 1000;
  private visualBullets: VisualBullet[] = [];
  private muzzleFlash: THREE.Mesh | null = null;
  private shotsFired = 0;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private otherPlayers: Map<string, THREE.Group>;
  private onHitCallback: (targetPlayerId: string, damage: number, hitPoint: number[], distance: number) => void;

  constructor(
    scene: THREE.Scene, 
    camera: THREE.PerspectiveCamera, 
    otherPlayers: Map<string, THREE.Group>,
    onHitCallback: (targetPlayerId: string, damage: number, hitPoint: number[], distance: number) => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.otherPlayers = otherPlayers;
    this.onHitCallback = onHitCallback;
  }

  public shoot() {
    const now = performance.now();
    
    if (now - this.lastShotTime < this.shotCooldown) {
      console.log(`🚫 Shot cooldown: ${Math.round(this.shotCooldown - (now - this.lastShotTime))}ms remaining`);
      return;
    }
    
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    
    this.raycaster.set(this.camera.position, direction);
    
    this.createMuzzleFlash();
    this.createVisualBullet(this.camera.position.clone(), direction.clone());
    
    const targets: THREE.Object3D[] = [];
    this.otherPlayers.forEach((player) => {
      targets.push(player);
    });
    
    const intersects = this.raycaster.intersectObjects(targets, true);
    
    this.lastShotTime = now;
    this.shotsFired++;
    
    console.log(`🔫 Shooting from position: [${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)}]`);
    
    if (intersects.length > 0) {
      const target = intersects[0];
      const distance = target.distance;
      
      if (distance <= this.maxShotRange) {
        let targetPlayerId: string | null = null;
        for (const [playerId, playerMesh] of this.otherPlayers) {
          if (target.object.parent === playerMesh || target.object === playerMesh) {
            targetPlayerId = playerId;
            break;
          }
        }
        
        if (targetPlayerId) {
          console.log(`�� Hit target! Player ID: ${targetPlayerId}, Distance: ${distance.toFixed(2)}m`);
          
          this.onHitCallback(
            targetPlayerId,
            10,
            target.point.toArray(),
            distance
          );
          
          this.showHitMarker(target.point);
        }
      } else {
        console.log(`�� Target too far: ${distance.toFixed(2)}m (max: ${this.maxShotRange}m)`);
      }
    } else {
      console.log(`💨 Shot missed - no targets in range`);
    }
  }

  public updateVisualBullets(deltaTime: number) {
    for (let i = this.visualBullets.length - 1; i >= 0; i--) {
      const bullet = this.visualBullets[i];
      if (!bullet.update(deltaTime)) {
        bullet.dispose();
        this.visualBullets.splice(i, 1);
      }
    }
  }

  private createVisualBullet(startPosition: THREE.Vector3, direction: THREE.Vector3) {
    const bullet = new VisualBullet(startPosition, direction, this.scene);
    this.visualBullets.push(bullet);
  }

  private createMuzzleFlash() {
    this.createMuzzleFlashOverlay();
    
    if (this.muzzleFlash) {
      this.scene.remove(this.muzzleFlash);
      this.muzzleFlash.geometry.dispose();
      (this.muzzleFlash.material as THREE.Material).dispose();
    }
    
    const geometry = new THREE.SphereGeometry(0.5, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    
    this.muzzleFlash = new THREE.Mesh(geometry, material);
    this.scene.add(this.muzzleFlash);
    
    setTimeout(() => {
      if (this.muzzleFlash) {
        this.scene.remove(this.muzzleFlash);
        this.muzzleFlash.geometry.dispose();
        (this.muzzleFlash.material as THREE.Material).dispose();
        this.muzzleFlash = null;
      }
    }, 100);
  }

  private createMuzzleFlashOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'muzzle-flash-overlay';
    document.body.appendChild(overlay);
    
    overlay.addEventListener('animationend', () => {
      document.body.removeChild(overlay);
    });
  }

  private showHitMarker(position: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(0.5, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(geometry, material);
    
    marker.position.copy(position);
    this.scene.add(marker);
    
    setTimeout(() => {
      this.scene.remove(marker);
      geometry.dispose();
      material.dispose();
    }, 1000);
  }

  public getShotsFired(): number {
    return this.shotsFired;
  }

  public getLastShotTime(): number {
    return this.lastShotTime;
  }

  public getShotCooldown(): number {
    return this.shotCooldown;
  }
} 
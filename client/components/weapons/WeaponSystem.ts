import * as THREE from 'three';
import { VisualBullet } from './VisualBullet';

export interface WeaponStatus {
  isReady: boolean;
  cooldownRemaining: number;
  shotsFired: number;
}

export class WeaponSystem {
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private lastShotTime = 0;
  private readonly shotCooldown = 500; // 0.5초 (1초에 2발)
  private readonly maxShotRange = 1000; // 최대 사격 거리
  private visualBullets: VisualBullet[] = [];
  private muzzleFlash: THREE.Mesh | null = null;
  private shotsFired = 0;
  
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private otherPlayers: Map<string, THREE.Group>;
  private onHitCallback?: (targetId: string, damage: number, hitPoint: THREE.Vector3, distance: number) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    otherPlayers: Map<string, THREE.Group>,
    onHitCallback?: (targetId: string, damage: number, hitPoint: THREE.Vector3, distance: number) => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.otherPlayers = otherPlayers;
    this.onHitCallback = onHitCallback;
  }

  public shoot(localPlane?: THREE.Group): boolean {
    const now = performance.now();
    
    // 연사 제한 체크 (1초에 2발)
    if (now - this.lastShotTime < this.shotCooldown) {
      console.log(`🚫 Shot cooldown: ${Math.round(this.shotCooldown - (now - this.lastShotTime))}ms remaining`);
      return false;
    }
    
    if (!localPlane) {
      console.log('❌ Cannot shoot: localPlane not available');
      return false;
    }
    
    // 카메라 위치와 방향으로 raycasting
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    
    this.raycaster.set(this.camera.position, direction);
    
    // 시각적 효과 생성 (레이캐스팅과 독립적)
    this.createMuzzleFlash(localPlane);
    this.createVisualBullet(this.camera.position.clone(), direction.clone());
    
    // 다른 플레이어들을 대상으로 raycasting
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
        // 타겟이 된 플레이어 찾기
        let targetPlayerId: string | null = null;
        for (const [playerId, playerMesh] of this.otherPlayers) {
          if (target.object.parent === playerMesh || target.object === playerMesh) {
            targetPlayerId = playerId;
            break;
          }
        }
        
        if (targetPlayerId) {
          console.log(`🎯 Hit target! Player ID: ${targetPlayerId}, Distance: ${distance.toFixed(2)}m`);
          
          // 콜백을 통해 히트 이벤트 전달
          if (this.onHitCallback) {
            this.onHitCallback(targetPlayerId, 10, target.point, distance);
          }
          
          // 시각적 피드백 (히트 마커)
          this.showHitMarker(target.point);
          return true;
        }
      } else {
        console.log(`🚫 Target too far: ${distance.toFixed(2)}m (max: ${this.maxShotRange}m)`);
      }
    } else {
      console.log(`💨 Shot missed - no targets in range`);
    }
    
    return true;
  }

  public update(deltaTime: number) {
    // 시각적 총알 업데이트
    for (let i = this.visualBullets.length - 1; i >= 0; i--) {
      const bullet = this.visualBullets[i];
      if (!bullet.update(deltaTime)) {
        // 총알 수명 종료, 제거
        bullet.dispose();
        this.visualBullets.splice(i, 1);
      }
    }
  }

  public getStatus(): WeaponStatus {
    const now = performance.now();
    const cooldownRemaining = Math.max(0, this.shotCooldown - (now - this.lastShotTime));
    
    return {
      isReady: cooldownRemaining === 0,
      cooldownRemaining,
      shotsFired: this.shotsFired
    };
  }

  private createMuzzleFlash(localPlane: THREE.Group) {
    // CSS 총구 화염 효과
    this.createMuzzleFlashOverlay();
    
    // 기존 총구 화염 제거
    if (this.muzzleFlash) {
      this.scene.remove(this.muzzleFlash);
      this.muzzleFlash.geometry.dispose();
      (this.muzzleFlash.material as THREE.Material).dispose();
    }
    
    // 새 총구 화염 생성 (3D 효과)
    const geometry = new THREE.SphereGeometry(0.5, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    
    this.muzzleFlash = new THREE.Mesh(geometry, material);
    
    // 비행기 앞쪽에 위치
    const muzzlePosition = new THREE.Vector3(0, 0, -2).applyQuaternion(localPlane.quaternion);
    this.muzzleFlash.position.copy(localPlane.position).add(muzzlePosition);
    
    this.scene.add(this.muzzleFlash);
    
    // 100ms 후 제거
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
    
    // 애니메이션 종료 후 제거
    overlay.addEventListener('animationend', () => {
      document.body.removeChild(overlay);
    });
  }

  private createVisualBullet(startPosition: THREE.Vector3, direction: THREE.Vector3) {
    const bullet = new VisualBullet(startPosition, direction, this.scene);
    this.visualBullets.push(bullet);
  }

  private showHitMarker(position: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(0.5, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(geometry, material);
    
    marker.position.copy(position);
    this.scene.add(marker);
    
    // 1초 후 제거
    setTimeout(() => {
      this.scene.remove(marker);
      geometry.dispose();
      material.dispose();
    }, 1000);
  }
}

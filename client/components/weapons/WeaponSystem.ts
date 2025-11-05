import * as THREE from 'three';
import { VisualBullet } from './VisualBullet';

export interface WeaponStatus {
  isReady: boolean;
  cooldownRemaining: number;
  shotsFired: number;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  reloadTimeRemaining: number;
}

export class WeaponSystem {
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private lastShotTime = 0;
  private readonly shotCooldown = 100; // 0.5초 (1초에 2발)
  private readonly maxShotRange = 1000; // 최대 사격 거리
  private visualBullets: VisualBullet[] = [];
  private muzzleFlash: THREE.Mesh | null = null;
  private shotsFired = 0;

  // 탄약 시스템
  private ammo = 100;
  private readonly maxAmmo = 100;
  private isReloading = false;
  private reloadStartTime = 0;
  private readonly reloadDuration = 3000; // 3초
  
  // 월드 스페이스 조준점은 CSS 크로스헤어로 대체 (사용 안 함)
  
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

    // 화면 중앙 CSS 크로스헤어만 사용. 월드 링 조준점은 생성하지 않음.
  }

  // ===== 내부 유틸: 타격 객체 → 플레이어 매핑 강화 =====
  private getHitPlayerIdFromObject(object: THREE.Object3D): string | null {
    for (const [playerId, playerRoot] of this.otherPlayers) {
      let node: THREE.Object3D | null = object;
      while (node) {
        if (node === playerRoot) return playerId;
        node = node.parent;
      }
    }
    return null;
  }

  public shoot(localPlane?: THREE.Group): boolean {
    console.log('shoot');
    const now = performance.now();

    // 재장전 중이면 발사 불가
    if (this.isReloading) {
      console.log('🚫 Cannot shoot: reloading in progress');
      return false;
    }

    // 탄약 체크
    if (this.ammo <= 0) {
      console.log('🚫 Cannot shoot: no ammo remaining');
      return false;
    }

    // 연사 제한 체크 (1초에 2발)
    if (now - this.lastShotTime < this.shotCooldown) {
      console.log(`🚫 Shot cooldown: ${Math.round(this.shotCooldown - (now - this.lastShotTime))}ms remaining`);
      return false;
    }

    if (!localPlane) {
      console.log('❌ Cannot shoot: localPlane not available');
      return false;
    }
    
    // 화면 중앙(NDC: 0,0) 기준으로 레이캐스트 (일반 FPS 조준)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    // Sprite 포함 오브젝트에 대한 레이캐스트를 위해 카메라 지정 (안전)
    this.raycaster.camera = this.camera;
    
    // 시각적 효과 생성 (레이캐스팅과 독립적)
    this.createMuzzleFlash(localPlane);
    // 총알 시각 효과도 레이 방향과 일치시키기
    const startPos = this.camera.position.clone();
    const dir = this.raycaster.ray.direction.clone();
    this.createVisualBullet(startPos, dir);
    
    // 다른 플레이어들을 대상으로 raycasting
    const targets: THREE.Object3D[] = [];
    this.otherPlayers.forEach((player) => {
      if (player) targets.push(player);
    });
    
    const intersects = this.raycaster.intersectObjects(targets, true);
    
    this.lastShotTime = now;
    this.shotsFired++;
    this.ammo--; // 탄약 소모
    console.log(`🔫 Shooting from position: [${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)}] - Ammo: ${this.ammo}/${this.maxAmmo}`);
    
    if (intersects.length > 0) {
      // 이름표(Sprite) 등은 제외하고 실제 메시만 타격 대상으로 인정
      const firstValidHit = intersects.find(i => !(i.object instanceof THREE.Sprite));
      if (!firstValidHit) {
        console.log('💨 Shot hit non-target (sprite/nameplate) only');
        return true;
      }
      const distance = firstValidHit.distance;
      
      if (distance <= this.maxShotRange) {
        // 타겟이 된 플레이어 찾기 (부모 체인으로 안전 판별)
        const targetPlayerId = this.getHitPlayerIdFromObject(firstValidHit.object);
        if (targetPlayerId) {
          console.log(`🎯 Hit target! Player ID: ${targetPlayerId}, Distance: ${distance.toFixed(2)}m`);
          
          // 콜백을 통해 히트 이벤트 전달
          if (this.onHitCallback) {
            this.onHitCallback(targetPlayerId, 10, firstValidHit.point, distance);
          }
          
          // 시각적 피드백 (히트 마커)
          this.showHitMarker(firstValidHit.point);
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

  public reload(): boolean {
    if (this.isReloading) {
      console.log('🚫 Already reloading');
      return false;
    }

    if (this.ammo >= this.maxAmmo) {
      console.log('🚫 Ammo is full');
      return false;
    }

    this.isReloading = true;
    this.reloadStartTime = performance.now();
    console.log(`🔄 Reloading... (${this.reloadDuration / 1000}s)`);
    return true;
  }

  public update(deltaTime: number) {
    // 재장전 상태 업데이트
    if (this.isReloading) {
      const now = performance.now();
      if (now - this.reloadStartTime >= this.reloadDuration) {
        this.ammo = this.maxAmmo;
        this.isReloading = false;
        console.log(`✅ Reload complete! Ammo: ${this.ammo}/${this.maxAmmo}`);
      }
    }

    // 시각적 총알 업데이트
    for (let i = this.visualBullets.length - 1; i >= 0; i--) {
      const bullet = this.visualBullets[i];
      if (!bullet.update(deltaTime)) {
        // 총알 수명 종료, 제거
        bullet.dispose();
        this.visualBullets.splice(i, 1);
      }
    }

    // 월드 링 조준점은 사용하지 않음
  }

  public getStatus(): WeaponStatus {
    const now = performance.now();
    const cooldownRemaining = Math.max(0, this.shotCooldown - (now - this.lastShotTime));
    const reloadTimeRemaining = this.isReloading ?
      Math.max(0, this.reloadDuration - (now - this.reloadStartTime)) : 0;

    return {
      isReady: cooldownRemaining === 0 && this.ammo > 0 && !this.isReloading,
      cooldownRemaining,
      shotsFired: this.shotsFired,
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      isReloading: this.isReloading,
      reloadTimeRemaining
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

  // (삭제됨) 월드 스페이스 조준점 유틸은 더 이상 사용하지 않습니다.
}

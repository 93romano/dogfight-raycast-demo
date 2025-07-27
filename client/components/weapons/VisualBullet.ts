import * as THREE from 'three';

export class VisualBullet {
  private mesh: THREE.Mesh;
  private velocity: THREE.Vector3;
  private lifeTime: number = 0;
  private maxLifeTime: number = 2; // 2초
  private scene: THREE.Scene;
  private trail: THREE.Mesh[] = [];
  private readonly trailLength = 10;

  constructor(startPosition: THREE.Vector3, direction: THREE.Vector3, scene: THREE.Scene) {
    this.scene = scene;
    
    // 총알 메시 생성
    const geometry = new THREE.SphereGeometry(0.05, 8, 8);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xffff00
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(startPosition);
    
    // 속도 설정 (매우 빠르게)
    this.velocity = direction.normalize().multiplyScalar(200); // 200 units/second
    
    this.scene.add(this.mesh);
    
    // 궤적 생성
    this.createTrail();
  }

  private createTrail() {
    for (let i = 0; i < this.trailLength; i++) {
      const trailGeometry = new THREE.SphereGeometry(0.02, 4, 4);
      const opacity = (this.trailLength - i) / this.trailLength * 0.5;
      const trailMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffaa00,
        transparent: true,
        opacity: opacity
      });
      const trailMesh = new THREE.Mesh(trailGeometry, trailMaterial);
      trailMesh.position.copy(this.mesh.position);
      this.trail.push(trailMesh);
      this.scene.add(trailMesh);
    }
  }

  public update(deltaTime: number): boolean {
    this.lifeTime += deltaTime;
    
    // 총알 이동
    const movement = this.velocity.clone().multiplyScalar(deltaTime);
    this.mesh.position.add(movement);
    
    // 궤적 업데이트
    this.updateTrail();
    
    // 수명 체크
    if (this.lifeTime >= this.maxLifeTime) {
      return false; // 제거해야 함
    }
    
    return true; // 계속 유지
  }

  private updateTrail() {
    // 궤적 위치 업데이트 (뒤에서부터)
    for (let i = this.trail.length - 1; i > 0; i--) {
      this.trail[i].position.copy(this.trail[i - 1].position);
    }
    
    // 첫 번째 궤적을 총알 위치로
    if (this.trail.length > 0) {
      this.trail[0].position.copy(this.mesh.position);
    }
  }

  public dispose() {
    // 총알 제거
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    
    // 궤적 제거
    this.trail.forEach(trailMesh => {
      this.scene.remove(trailMesh);
      trailMesh.geometry.dispose();
      (trailMesh.material as THREE.Material).dispose();
    });
    this.trail = [];
  }
}

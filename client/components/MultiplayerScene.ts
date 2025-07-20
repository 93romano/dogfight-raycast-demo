// client/components/MultiplayerScene.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SocketManager, PlayerState, MovementEvent } from '../network/SocketManager';
import { PlayerIdInput } from './PlayerIdInput';

// 물리 상태 인터페이스
interface PhysicsState {
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  lift: number;
  drag: number;
}

// 시각적 총알 클래스
class VisualBullet {
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

export class MultiplayerScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private localPlane: THREE.Group;
  public otherPlayers: Map<string, THREE.Group> = new Map();
  private socket: SocketManager | null = null;
  private skybox: THREE.CubeTexture;
  private playerIdInput: PlayerIdInput | null = null;

  private keys: Set<string> = new Set();
  private isPointerLocked = false;
  private mouseSensitivity = 0.002;

  private pitch = 0;
  private yaw = 0;
  private roll = 0;
  private physics: PhysicsState = {
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    lift: 0,
    drag: 0
  };

  private speed = 0;
  private readonly minSpeed = 0;
  private readonly maxSpeed = 700; // 100
  private readonly accel = 5; // 가속도 (프레임당 증가량)
  private readonly decel = 3; // 감속도 (프레임당 감소량)

  private lastStateUpdate = 0;
  private readonly stateUpdateInterval = 1000 / 10; // 20Hz → 10Hz로 줄임

  // 목표값 추가
  private targetPitch = 0;
  private targetYaw = 0;
  private targetRoll = 0;
  private targetSpeed = 0;
  // 보간 계수
  private lerpFactor = 0.5;

  // 클래스 멤버 추가
  private rollSpeed = 0;
  private readonly rollAccel = 0.001;
  private readonly rollFriction = 0.95;

  // 입력 상태 추적을 위한 변수들 추가
  private lastInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
  };
  private inputChanged = false;
  private lastMovementTime = 0;
  private readonly movementEventInterval = 5000; // 200ms → 5000ms (5초)

  // 위치 변경 추적을 위한 변수 추가
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private lastRotation: THREE.Quaternion = new THREE.Quaternion();
  private positionChangeThreshold = 0.5; // 0.1 → 0.5로 늘림 (더 큰 변화만 감지)
  private rotationChangeThreshold = 0.05;

  // 사격 시스템 관련 변수
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private lastShotTime = 0;
  private readonly shotCooldown = 500; // 0.5초 (1초에 2발)
  private readonly maxShotRange = 1000; // 최대 사격 거리
  
  // 시각적 효과 관련 변수
  private visualBullets: VisualBullet[] = [];
  private muzzleFlash: THREE.Mesh | null = null;
  
  // 체력 시스템
  private health = 100;
  private readonly maxHealth = 100;
  
  // 무기 시스템
  private shotsFired = 0;
  
  // 로그 제어 변수
  private lastLogTime = 0; // 0.01 → 0.05로 늘림

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.initSkybox();
    this.initLights();
    this.showPlayerIdInput();
    this.initPointerLock();
    this.initEvents();
    this.initEnvironment();
    this.loadPlaneModel();
    this.createCrosshair();

    // 초기 체력 UI 설정
    setTimeout(() => {
      this.updateHealthUI();
    }, 100);

    window.addEventListener('resize', this.onResize);
  }

  private initSkybox() {
    const loader = new THREE.CubeTextureLoader();
    const skybox = loader.setPath('/assets/skybox/').load([
      'valley_ft.jpg', // +X
      'valley_bk.jpg', // -X
      'valley_up.jpg', // +Y
      'valley_dn.jpg', // -Y
      'valley_rt.jpg', // +Z
      'valley_lf.jpg', // -Z
    ]);
    skybox.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skybox;
  }

  private async loadPlaneModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('/assets/models/Jet.glb');
      const plane = gltf.scene;
      plane.scale.set(0.5, 0.5, 0.5);
      plane.position.set(0, 0, 0);
      // 자식 mesh에 직접 회전 적용
      if (plane.children[0]) {
        plane.children[0].rotation.y = Math.PI;
      }
      this.scene.add(plane);
      this.localPlane = plane;
    } catch (error) {
      console.error('Error loading plane model:', error);
      // Fallback to basic plane if model loading fails
      this.localPlane = this.createBasicPlane(0x3399ff);
      this.scene.add(this.localPlane);
    }
  }

  private createBasicPlane(color: number): THREE.Group {
    const group = new THREE.Group();

    // Fuselage
    const fuselageGeometry = new THREE.CylinderGeometry(0.2, 0.2, 3, 8);
    const fuselageMaterial = new THREE.MeshPhongMaterial({ color });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.rotation.x = Math.PI / 2;
    group.add(fuselage);

    // Wings
    const wingGeometry = new THREE.BoxGeometry(4, 0.1, 1);
    const wingMaterial = new THREE.MeshPhongMaterial({ color });
    const wings = new THREE.Mesh(wingGeometry, wingMaterial);
    group.add(wings);

    // Tail
    const tailGeometry = new THREE.BoxGeometry(1, 0.1, 0.5);
    const tailMaterial = new THREE.MeshPhongMaterial({ color });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.set(0, 0.2, -1.5);
    group.add(tail);

    group.castShadow = true;
    return group;
  }

  private initEnvironment() {
    // Add ground
    /*
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x228B22,
      side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    */

    // Add clouds
    for (let i = 0; i < 20; i++) {
      const cloud = this.createCloud();
      cloud.position.set(
        Math.random() * 1000 - 500,
        Math.random() * 100 + 50,
        Math.random() * 1000 - 500
      );
      this.scene.add(cloud);
    }
  }

  private createCloud(): THREE.Group {
    const group = new THREE.Group();
    const geometry = new THREE.SphereGeometry(1, 8, 8);
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8
    });

    for (let i = 0; i < 3; i++) {
      const cloud = new THREE.Mesh(geometry, material);
      cloud.position.set(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      );
      cloud.scale.set(
        Math.random() * 2 + 2,
        Math.random() * 2 + 2,
        Math.random() * 2 + 2
      );
      group.add(cloud);
    }

    return group;
  }

  private initLights() {
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(5, 10, 7);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    this.scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x888888);
    this.scene.add(ambientLight);
  }

  private showPlayerIdInput() {
    this.playerIdInput = new PlayerIdInput({
      onAuthentication: async (username: string) => {
        console.log('🎯 Username submitted:', username);
        
        try {
          await this.initializeSocket(username);
          
          return {
            success: true,
            username: username
          };
        } catch (error) {
          console.error('Authentication failed:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '서버 연결에 실패했습니다.'
          };
        }
      },
      onError: (error: Error) => {
        console.error('🚨 Authentication error:', error);
        this.showError('인증 중 오류가 발생했습니다: ' + error.message);
      }
    });
  }

  private async initializeSocket(username: string): Promise<void> {
    console.log('🔌 Initializing socket with Username:', username);
    
    return new Promise((resolve, reject) => {
      this.socket = new SocketManager(
        (id, state) => this.addRemotePlayer(id, state),
        (id, state) => this.updateRemotePlayer(id, state),
        (id) => this.removeRemotePlayer(id),
        (players) => {
          console.log('📋 Received all players:', players);
          Object.entries(players).forEach(([id, state]) => {
            // 내 플레이어 ID와 다른 경우에만 추가
            if (this.socket && id !== this.socket.getPlayerId()?.toString()) {
              this.addRemotePlayer(id, state);
            }
          });
          resolve(); // 연결 성공
        },
        (id, event) => this.handleRemotePlayerMovement(id, event),
        (attackerId, victimId, damage, victimHealth) => this.handlePlayerHit(attackerId, victimId, damage, victimHealth),
        (victimId, attackerId, respawnPosition) => this.handlePlayerDeath(victimId, attackerId, respawnPosition)
      );

      // WebSocket 이벤트 리스너 추가
      const originalConnect = this.socket.connectWithUsername.bind(this.socket);
      
      // 연결 성공 감지를 위한 임시 해결책
      const checkConnection = () => {
        if (this.socket?.isConnected() && this.socket?.getPlayerId()) {
          console.log('🎯 Socket connected successfully with Player ID:', this.socket.getPlayerId());
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      try {
        this.socket.connectWithUsername(username);
        
        // 연결 확인 시작
        setTimeout(checkConnection, 100);
        
        // 연결 타임아웃 설정
        setTimeout(() => {
          if (!this.socket?.isConnected() || !this.socket?.getPlayerId()) {
            reject(new Error('서버 연결 시간이 초과되었습니다.'));
          }
        }, 10000); // 10초 타임아웃
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 에러 메시지를 사용자에게 표시합니다
   */
  private showError(message: string): void {
    // 간단한 에러 표시 (추후 더 나은 UI로 개선 가능)
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 15px;
      border-radius: 5px;
      z-index: 2000;
      max-width: 300px;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    // 5초 후 자동 제거
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 5000);
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
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    
    // 마우스 클릭으로 사격
    document.addEventListener('click', (event) => {
      console.log('🎯 Mouse clicked',event);
      if (this.isPointerLocked) {
        this.shoot();
      }
    });
    
    // 마우스 움직임 처리 (기존 포인터락 시스템과 통합)
    document.addEventListener('mousemove', (event) => {
      if (this.isPointerLocked) {
        this.targetYaw -= event.movementX * this.mouseSensitivity;
        this.targetPitch -= event.movementY * this.mouseSensitivity;
        
        const pitchLimit = Math.PI / 2 - 0.01;
        this.targetPitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.targetPitch));
      }
    });
  }

  private async addRemotePlayer(id: string, state: PlayerState) {
    console.log(`🎮 Adding remote player ${id} at position:`, state.position);
    
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('assets/models/Jet.glb');
      const mesh = gltf.scene.clone(); // clone으로 각 유저별 독립적인 모델 생성
      
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
      
      mesh.scale.set(0.5, 0.5, 0.5); // 1,1,1
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

  // 플레이어 ID 라벨 추가
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
    
    sprite.position.set(0, 3, 0); // 비행기 위에 표시
    sprite.scale.set(2, 0.5, 1);
    
    mesh.add(sprite);
  }

  private updateRemotePlayer(id: string, state: PlayerState) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      // 부드러운 보간으로 업데이트
      const targetPosition = new THREE.Vector3().fromArray(state.position);
      const targetQuaternion = new THREE.Quaternion().fromArray(state.rotation);
      
      // 더 부드러운 보간 (낮은 값 = 더 부드러움)
      mesh.position.lerp(targetPosition, 0.1);
      mesh.quaternion.slerp(targetQuaternion, 0.1);
      
      // 디버그 로그 (선택사항)
      if (Math.random() < 0.01) { // 1% 확률로 로그 출력
        console.log(`🎮 Remote player ${id} updated:`, {
          position: targetPosition.toArray(),
          rotation: targetQuaternion.toArray()
        });
      }
    }
  }

  private removeRemotePlayer(id: string) {
    console.log(`🎮 Removing remote player ${id}`);
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.otherPlayers.delete(id);
    }
  }

  // 입력 처리
  private handleInput() {
    // 현재 입력 상태 확인
    const currentInputState = {
      forward: this.keys.has('KeyW'),
      backward: this.keys.has('KeyS'),
      left: this.keys.has('KeyA'),
      right: this.keys.has('KeyD'),
      up: this.keys.has('ArrowUp'),
      down: this.keys.has('ArrowDown')
    };

    // 입력 상태가 변경되었는지 확인
    this.inputChanged = 
      currentInputState.forward !== this.lastInputState.forward ||
      currentInputState.backward !== this.lastInputState.backward ||
      currentInputState.left !== this.lastInputState.left ||
      currentInputState.right !== this.lastInputState.right ||
      currentInputState.up !== this.lastInputState.up ||
      currentInputState.down !== this.lastInputState.down;

    // 입력 상태 업데이트
    this.lastInputState = { ...currentInputState };

    // 가속/감속 (기존과 동일)
    if (this.keys.has('KeyW')) {
      this.speed += this.accel;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    } else if (this.keys.has('KeyS')) {
      this.speed -= this.decel;
      if (this.speed < this.minSpeed) this.speed = this.minSpeed;
    } else {
      const friction = 0.99;
      this.speed *= friction;
      if (Math.abs(this.speed) < 0.01) this.speed = 0;
    }

    // 롤 관성 적용
    if (this.keys.has('KeyA')) {
      this.rollSpeed += this.rollAccel;
    } else if (this.keys.has('KeyD')) {
      this.rollSpeed -= this.rollAccel;
    } else {
      this.rollSpeed *= this.rollFriction;
      // 롤 입력이 없고, 롤 속도가 거의 0이면 targetRoll을 0으로 서서히 복원
      if (Math.abs(this.rollSpeed) < 0.0001) {
        // 보간 계수(0.05~0.2 사이 실험적으로 조정)
        this.targetRoll = THREE.MathUtils.lerp(this.targetRoll, 0, 0.1);
        // 아주 근접하면 0으로 스냅
        if (Math.abs(this.targetRoll) < 0.001) this.targetRoll = 0;
      }
    }
    this.targetRoll += this.rollSpeed;

    // 요
    if (this.keys.has('ArrowLeft')) this.targetYaw += 0.03;
    if (this.keys.has('ArrowRight')) this.targetYaw -= 0.03;

    // 피치
    if (this.keys.has('ArrowUp')) this.targetPitch -= 0.03;
    if (this.keys.has('ArrowDown')) this.targetPitch += 0.03;
  }

  // 움직임 이벤트 전송 (5초마다)
  private sendMovementEvent() {
    if (!this.localPlane || !this.socket) return;

    const now = performance.now();
    
    // 5초마다 움직임 이벤트 전송
    if ((now - this.lastMovementTime) >= this.movementEventInterval) {
      const movementEvent: MovementEvent = {
        type: 'movement',
        input: {
          forward: this.lastInputState.forward,
          backward: this.lastInputState.backward,
          left: this.lastInputState.left,
          right: this.lastInputState.right,
          up: this.lastInputState.up,
          down: this.lastInputState.down,
          roll: this.rollSpeed / this.rollAccel
        },
        position: this.localPlane.position.toArray(),
        rotation: this.localPlane.quaternion.toArray(),
        speed: this.speed
      };

      console.log(`🎮 Sending movement event every 5 seconds - Player ID: ${this.socket.getSocketId()}`);
      console.log(`   Position: [${this.localPlane.position.x.toFixed(2)}, ${this.localPlane.position.y.toFixed(2)}, ${this.localPlane.position.z.toFixed(2)}]`);
      
      this.socket.sendMovementEvent(movementEvent);
      this.lastMovementTime = now;
      this.inputChanged = false;
    }
  }

  // updatePhysics 개선
  private updatePhysics(deltaTime: number) {
    if (!this.localPlane) return;

    // 이전 위치와 회전 저장
    this.lastPosition.copy(this.localPlane.position);
    this.lastRotation.copy(this.localPlane.quaternion);

    // 목표값 → 실제값 보간
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, this.lerpFactor);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, this.lerpFactor);
    this.roll = THREE.MathUtils.lerp(this.roll, this.targetRoll, this.lerpFactor);
    this.physics.velocity.z = THREE.MathUtils.lerp(this.physics.velocity.z, this.speed, 0.1);

    // 회전 적용
    const rotation = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    this.localPlane.quaternion.setFromEuler(rotation);

    // 이동 적용
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.localPlane.quaternion);
    this.localPlane.position.add(direction.multiplyScalar(this.physics.velocity.z * deltaTime));

    // Y축 하한선 제한 (예: y >= 2)
    if (this.localPlane.position.y < 2) {
      this.localPlane.position.y = 2;
    }

    // 위치나 회전이 변경되었는지 확인
    this.checkPositionChange();
  }

  // 위치 변경 감지 및 서버 전송 (로그 줄임)
  private checkPositionChange() {
    if (!this.localPlane || !this.socket) return;

    const positionChanged = this.localPlane.position.distanceTo(this.lastPosition) > this.positionChangeThreshold;
    const rotationChanged = this.localPlane.quaternion.angleTo(this.lastRotation) > this.rotationChangeThreshold;

    if (positionChanged || rotationChanged) {
      // 로그 줄임 - 5초마다만 출력
      const now = Date.now();
      if (!this.lastLogTime || now - this.lastLogTime > 5000) {
        console.log(`🎮 Position changed - Player ID: ${this.socket.getSocketId()}`);
        console.log(`   Position: [${this.localPlane.position.x.toFixed(2)}, ${this.localPlane.position.y.toFixed(2)}, ${this.localPlane.position.z.toFixed(2)}]`);
        this.lastLogTime = now;
      }
      
      console.log(`🎮 Sending state to server - Player ID: ${this.socket.getSocketId()}`);

      // 서버로 상태 전송
      this.socket.sendState({
        position: this.localPlane.position.toArray(),
        rotation: this.localPlane.quaternion.toArray()
      });
    }
  }

  // 사격 시스템
  private shoot() {
    const now = performance.now();
    
    // 연사 제한 체크 (1초에 2발)
    if (now - this.lastShotTime < this.shotCooldown) {
      console.log(`🚫 Shot cooldown: ${Math.round(this.shotCooldown - (now - this.lastShotTime))}ms remaining`);
      return;
    }
    
    if (!this.localPlane || !this.socket) {
      console.log('❌ Cannot shoot: localPlane or socket not available');
      return;
    }
    
    // 카메라 위치와 방향으로 raycasting
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    
    this.raycaster.set(this.camera.position, direction);
    
    // 시각적 효과 생성 (레이캐스팅과 독립적)
    this.createMuzzleFlash();
    this.createVisualBullet(this.camera.position.clone(), direction.clone());
    
    // 다른 플레이어들을 대상으로 raycasting (기존 로직 유지)
    const targets: THREE.Object3D[] = [];
    this.otherPlayers.forEach((player) => {
      targets.push(player);
    });
    
    const intersects = this.raycaster.intersectObjects(targets, true);
    
    this.lastShotTime = now;
    this.shotsFired++;
    this.updateWeaponHUD();
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
          
          // 서버로 피격 이벤트 전송
          this.socket.sendHit(
            parseInt(targetPlayerId),
            10,
            target.point.toArray(),
            distance
          );
          
          // 시각적 피드백 (히트 마커)
          this.showHitMarker(target.point);
        }
      } else {
        console.log(`🚫 Target too far: ${distance.toFixed(2)}m (max: ${this.maxShotRange}m)`);
      }
    } else {
      console.log(`💨 Shot missed - no targets in range`);
    }
  }
  
  // 히트 마커 표시
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

  // 총구 화염 효과
  private createMuzzleFlash() {
    if (!this.localPlane) return;
    
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
    const muzzlePosition = new THREE.Vector3(0, 0, -2).applyQuaternion(this.localPlane.quaternion);
    this.muzzleFlash.position.copy(this.localPlane.position).add(muzzlePosition);
    
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

  // CSS 총구 화염 오버레이
  private createMuzzleFlashOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'muzzle-flash-overlay';
    document.body.appendChild(overlay);
    
    // 애니메이션 종료 후 제거
    overlay.addEventListener('animationend', () => {
      document.body.removeChild(overlay);
    });
  }

  // 시각적 총알 생성
  private createVisualBullet(startPosition: THREE.Vector3, direction: THREE.Vector3) {
    const bullet = new VisualBullet(startPosition, direction, this.scene);
    this.visualBullets.push(bullet);
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public update = () => {
    if (!this.localPlane) return;

    this.handleInput();

    const now = performance.now();
    const deltaTime = (now - this.lastStateUpdate) / 1000;
    this.lastStateUpdate = now;

    this.updatePhysics(deltaTime);

    // 시각적 총알 업데이트
    this.updateVisualBullets(deltaTime);

    // 무기 상태 업데이트
    this.updateWeaponHUD();

    // 카메라 추적
    const cameraOffset = new THREE.Vector3(0, 2, 8).applyQuaternion(this.localPlane.quaternion);
    const targetCameraPos = this.localPlane.position.clone().add(cameraOffset);
    this.camera.position.lerp(targetCameraPos, this.lerpFactor);
    this.camera.lookAt(this.localPlane.position);

    // 움직임 이벤트 전송 (입력 변경 시)
    this.sendMovementEvent();

    // 위치 변경 감지는 updatePhysics에서 처리됨

    this.renderer.render(this.scene, this.camera);
  };

  // 시각적 총알 업데이트
  private updateVisualBullets(deltaTime: number) {
    for (let i = this.visualBullets.length - 1; i >= 0; i--) {
      const bullet = this.visualBullets[i];
      if (!bullet.update(deltaTime)) {
        // 총알 수명 종료, 제거
        bullet.dispose();
        this.visualBullets.splice(i, 1);
      }
    }
  }

  // 조준점 생성
  private createCrosshair() {
    const crosshairElement = document.createElement('div');
    crosshairElement.id = 'crosshair';
    crosshairElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.8);
      border-radius: 50%;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    `;
    document.body.appendChild(crosshairElement);
  }

  // 체력 UI 업데이트
  private updateHealthUI() {
    const healthFill = document.getElementById('health-fill');
    const healthText = document.getElementById('health-text');
    
    if (healthFill && healthText) {
      const healthPercentage = (this.health / this.maxHealth) * 100;
      healthFill.style.width = `${healthPercentage}%`;
      healthText.textContent = `${this.health}/${this.maxHealth}`;
      
      // 체력에 따른 색상 변경
      if (healthPercentage > 60) {
        healthFill.style.background = '#4CAF50'; // 녹색
      } else if (healthPercentage > 30) {
        healthFill.style.background = '#FFC107'; // 노란색
      } else {
        healthFill.style.background = '#F44336'; // 빨간색
      }
    }
  }

  // 무기 HUD 업데이트
  private updateWeaponHUD() {
    const weaponStatus = document.getElementById('weapon-status');
    const shotsFiredElement = document.getElementById('shots-fired');
    
    if (weaponStatus) {
      const now = performance.now();
      const cooldownRemaining = this.shotCooldown - (now - this.lastShotTime);
      
      if (cooldownRemaining > 0) {
        weaponStatus.textContent = `Reloading (${Math.ceil(cooldownRemaining / 100) / 10}s)`;
        weaponStatus.style.color = '#FFC107';
      } else {
        weaponStatus.textContent = 'Ready';
        weaponStatus.style.color = '#4CAF50';
      }
    }
    
    if (shotsFiredElement) {
      shotsFiredElement.textContent = this.shotsFired.toString();
    }
  }
  
  // 피격 처리
  public takeDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    this.updateHealthUI();
    
    console.log(`💔 Took ${damage} damage! Health: ${this.health}/${this.maxHealth}`);
    
    // 피격 시각적 효과
    this.showDamageEffect();
    
    if (this.health <= 0) {
      console.log('💀 Player died!');
      this.handleLocalPlayerDeath();
    }
  }
  
  // 피격 시각적 효과
  private showDamageEffect() {
    // 개선된 CSS 피격 효과
    const overlay = document.createElement('div');
    overlay.className = 'damage-overlay';
    document.body.appendChild(overlay);
    
    // 애니메이션 종료 후 제거
    overlay.addEventListener('animationend', () => {
      document.body.removeChild(overlay);
    });
  }
  
  // 로컬 플레이어 사망 처리
  private handleLocalPlayerDeath() {
    // 사망 시 위치 리셋
    if (this.localPlane) {
      this.localPlane.position.set(0, 10, 0);
      this.localPlane.quaternion.set(0, 0, 0, 1);
    }
    
    // 체력 회복
    this.health = this.maxHealth;
    this.updateHealthUI();
    
    console.log('🔄 Respawned with full health');
  }

  public getSpeed(): number {
    return this.physics.velocity.length();
  }

  public getPosition(): THREE.Vector3 {
    return this.localPlane ? this.localPlane.position.clone() : new THREE.Vector3();
  }

  public getActiveKeys(): Set<string> {
    return new Set(this.keys);
  }

  public sendState(state: PlayerState) {
    console.log('[DEBUG] sendState called', state);
    this.socket?.sendState(state);
  }

  private handleRemotePlayerMovement(id: string, event: MovementEvent) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      // 움직임 이벤트에 따라 원격 플레이어 업데이트
      const targetPosition = new THREE.Vector3().fromArray(event.position);
      const targetQuaternion = new THREE.Quaternion().fromArray(event.rotation);
      
      // 더 부드러운 보간으로 업데이트
      mesh.position.lerp(targetPosition, 0.2);
      mesh.quaternion.slerp(targetQuaternion, 0.2);
      
      console.log(`🎮 Remote player ${id} movement:`, {
        input: event.input,
        position: event.position,
        speed: event.speed
      });
    }
  }

  // 피격 이벤트 처리
  private handlePlayerHit(attackerId: string, victimId: string, damage: number, victimHealth: number) {
    console.log(`🎯 Player ${attackerId} hit Player ${victimId} for ${damage} damage! Victim health: ${victimHealth}`);
    
    // 내가 피격당한 경우
    if (this.socket && victimId === this.socket.getPlayerId()?.toString()) {
      this.takeDamage(damage);
    }
    
    // 다른 플레이어의 피격 표시 (선택사항)
    const victimMesh = this.otherPlayers.get(victimId);
    if (victimMesh) {
      // 피격 시각적 효과 (빨간색 깜빡임)
      this.showPlayerHitEffect(victimMesh);
    }
  }

  // 사망 이벤트 처리 (서버로부터)
  private handlePlayerDeath(victimId: string, attackerId: string, respawnPosition: number[]) {
    console.log(`💀 Player ${victimId} was killed by Player ${attackerId}`);
    
    // 사망한 플레이어의 위치를 리스폰 위치로 업데이트
    const victimMesh = this.otherPlayers.get(victimId);
    if (victimMesh) {
      victimMesh.position.fromArray(respawnPosition);
      victimMesh.quaternion.set(0, 0, 0, 1);
    }
    
    // 내가 죽은 경우는 이미 takeDamage에서 처리됨
  }

  // 플레이어 피격 시각적 효과
  private showPlayerHitEffect(playerMesh: THREE.Group) {
    // 원래 색상 저장
    const originalColors: THREE.Color[] = [];
    
    playerMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat, index) => {
            originalColors.push(mat.color.clone());
            mat.color.setHex(0xff0000); // 빨간색으로 변경
          });
        } else {
          originalColors.push(child.material.color.clone());
          child.material.color.setHex(0xff0000); // 빨간색으로 변경
        }
      }
    });
    
    // 200ms 후 원래 색상으로 복원
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
}

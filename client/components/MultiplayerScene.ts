// client/components/MultiplayerScene.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SocketManager, PlayerState, MovementEvent } from '../network/SocketManager';
import { PlayerIdInput } from './PlayerIdInput';

interface PhysicsState {
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  lift: number;
  drag: number;
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
  private readonly maxSpeed = 700;
  private readonly accel = 5;
  private readonly decel = 3;

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
  private rotationChangeThreshold = 0.05; // 0.01 → 0.05로 늘림

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
    this.playerIdInput = new PlayerIdInput((playerId: number) => {
      console.log('🎯 Player ID submitted:', playerId);
      this.initializeSocket(playerId);
    });
  }

  private initializeSocket(playerId: number) {
    console.log('🔌 Initializing socket with Player ID:', playerId);
    
    this.socket = new SocketManager(
      (id, state) => this.addRemotePlayer(id, state),
      (id, state) => this.updateRemotePlayer(id, state),
      (id) => this.removeRemotePlayer(id),
      (players) => {
        console.log('📋 Received all players:', players);
        Object.entries(players).forEach(([id, state]) => {
          if (id !== playerId.toString()) {
            this.addRemotePlayer(id, state);
          }
        });
      },
      (id, event) => this.handleRemotePlayerMovement(id, event)
    );

    // 사용자가 입력한 Player ID로 연결
    this.socket.connectWithPlayerId(playerId);
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
      
      // 서버로 상태 전송
      this.socket.sendState({
        position: this.localPlane.position.toArray(),
        rotation: this.localPlane.quaternion.toArray()
      });
    }
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
}

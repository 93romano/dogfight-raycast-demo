// client/components/MultiplayerScene.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SocketManager, PlayerState, MovementEvent } from '../network/SocketManager';

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
  private otherPlayers: Map<string, THREE.Group> = new Map();
  private socket: SocketManager;
  private skybox: THREE.CubeTexture;

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
  private readonly maxSpeed = 100;
  private readonly accel = 1;    // 가속도 (프레임당 증가량)
  private readonly decel = 1.5;    // 감속도 (프레임당 감소량)

  private lastStateUpdate = 0;
  private readonly stateUpdateInterval = 1000 / 20; // 20Hz state updates

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
  private readonly movementEventInterval = 50; // 50ms마다 움직임 이벤트 전송

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
    this.initSocket();
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
      },
      (id, event) => this.handleRemotePlayerMovement(id, event)
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
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  private async addRemotePlayer(id: string, state: PlayerState) {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('assets/models/Jet.glb');
      const mesh = gltf.scene;
      mesh.scale.set(1, 1, 1);
      mesh.position.fromArray(state.position);
      mesh.quaternion.fromArray(state.rotation);
      this.scene.add(mesh);
      this.otherPlayers.set(id, mesh);
    } catch (error) {
      console.error('Error loading remote player model:', error);
      const mesh = this.createBasicPlane(0xff4444);
      mesh.position.fromArray(state.position);
      mesh.quaternion.fromArray(state.rotation);
      this.scene.add(mesh);
      this.otherPlayers.set(id, mesh);
    }
  }

  private updateRemotePlayer(id: string, state: PlayerState) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      // Smooth interpolation
      const targetPosition = new THREE.Vector3().fromArray(state.position);
      const targetQuaternion = new THREE.Quaternion().fromArray(state.rotation);
      
      mesh.position.lerp(targetPosition, 0.3);
      mesh.quaternion.slerp(targetQuaternion, 0.3);
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

  // 움직임 이벤트 전송
  private sendMovementEvent() {
    if (!this.localPlane) return;

    const now = performance.now();
    
    // 입력이 변경되었거나 일정 시간이 지났을 때만 이벤트 전송
    // if (this.inputChanged || (now - this.lastMovementTime) >= this.movementEventInterval) {
      if (this.inputChanged) {
      const movementEvent: MovementEvent = {
        type: 'movement',
        input: {
          forward: this.lastInputState.forward,
          backward: this.lastInputState.backward,
          left: this.lastInputState.left,
          right: this.lastInputState.right,
          up: this.lastInputState.up,
          down: this.lastInputState.down,
          roll: this.rollSpeed / this.rollAccel // 정규화된 롤 값
        },
        position: this.localPlane.position.toArray(),
        rotation: this.localPlane.quaternion.toArray(),
        speed: this.speed
      };

      this.socket.sendMovementEvent(movementEvent);
      this.lastMovementTime = now;
      this.inputChanged = false;
    }
  }

  // updatePhysics 개선
  private updatePhysics(deltaTime: number) {
    if (!this.localPlane) return;

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
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public update = () => {
    console.log('🔌 update');
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

    // 움직임 이벤트 전송
    this.sendMovementEvent();

    // 상태 업데이트는 변화가 있을 때만 전송 (SocketManager에서 처리)
    this.socket.sendState({
      position: this.localPlane.position.toArray(),
      rotation: this.localPlane.quaternion.toArray()
    });

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
    this.socket.sendState(state);
  }

  private handleRemotePlayerMovement(id: string, event: MovementEvent) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      // 움직임 이벤트에 따라 원격 플레이어 업데이트
      const targetPosition = new THREE.Vector3().fromArray(event.position);
      const targetQuaternion = new THREE.Quaternion().fromArray(event.rotation);
      
      // 부드러운 보간으로 업데이트
      mesh.position.lerp(targetPosition, 0.3);
      mesh.quaternion.slerp(targetQuaternion, 0.3);
      
      console.log(`🎮 Remote player ${id} movement:`, event.input);
    }
  }
}

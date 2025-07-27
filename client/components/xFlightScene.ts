import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class FlightScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private plane!: THREE.Object3D;
  private loader = new GLTFLoader();
  private keys: Set<string> = new Set();
  private isPointerLocked = false;
  private mouseSensitivity = 0.002;

  // 현재 회전값
  private pitch = 0;
  private yaw = 0;
  private roll = 0;
  
  // 목표 회전값
  private targetPitch = 0;
  private targetYaw = 0;
  private targetRoll = 0;

  // 비행 물리 속성
  private speed = 0;
  private readonly minSpeed = 0;
  private readonly maxSpeed = 10.0;
  private readonly speedIncrement = 0.02;
  private readonly rotationSpeed = 0.03;
  private readonly lerpFactor = 0.1;
  private readonly dragFactor = 0.99;
  private isModelLoaded = false;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ 
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.initSkybox();
    this.initLights();
    // this.initGround();
    this.initPlane();
    this.initEvents();
    this.initPointerLock();

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

  private async initPlane() {
    try {
      const gltf = await this.loader.loadAsync('/assets/models/Jet.glb');
      console.log(gltf);
      
      this.plane = gltf.scene;
      const mesh = this.plane.children[0];
      this.plane.scale.set(1, 1, 1);
      this.plane.position.set(0, 0, 0);
      // 모델이 +Z를 정면으로 본다면:
      // this.plane.rotation.y = Math.PI; // 180도 회전

      // 모델이 +X를 정면으로 본다면:
      // this.plane.rotation.y = -Math.PI / 2; // -90도 회전

      // this.plane.rotation.y = Math.PI;
      
      // 메쉬 회전 적용
      mesh.rotation.y = Math.PI;
      
      this.scene.add(this.plane);
      this.isModelLoaded = true;
      console.log('Plane model loaded successfully');
    } catch (error) {
      console.error('Error loading plane model:', error);
    }
  }

  private initLights() {
    const directional = new THREE.DirectionalLight(0xffffff, 1.2);
    directional.position.set(5, 10, 7);
    this.scene.add(directional);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
    backLight.position.set(-5, 10, -7);
    this.scene.add(backLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.5);
    this.scene.add(hemisphereLight);
  }

  // private initGround() {
  //   const ground = new THREE.Mesh(
  //     new THREE.PlaneGeometry(1000, 1000),
  //     new THREE.MeshStandardMaterial({ 
  //       color: 0x226622,
  //       roughness: 0.8,
  //       metalness: 0.2
  //     })
  //   );
  //   ground.rotation.x = -Math.PI / 2;
  //   ground.position.y = -2;
  //   this.scene.add(ground);
  // }

  private initEvents() {
    document.addEventListener('keydown', (event) => {
      console.log(event.key);
      
      this.keys.add(event.key.toLowerCase());
    });

    document.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });

    document.addEventListener('mousemove', (event) => {
      if (this.isPointerLocked) {
        this.roll -= event.movementX * this.mouseSensitivity;
        this.pitch -= event.movementY * this.mouseSensitivity;
        
        this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
      }
    });
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
        // 마우스 움직임을 목표 회전값에 적용
        this.targetYaw -= event.movementX * this.mouseSensitivity;
        this.targetPitch -= event.movementY * this.mouseSensitivity;
        
        // 피치 각도 제한
        const pitchLimit = Math.PI / 2 - 0.01;  // 약 89.99도
        this.targetPitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.targetPitch));
      }
    });
  }

  private onResize = () => {
    // Implementation of onResize method
  }

  public update = () => {
    if (!this.isModelLoaded) return;

    // 속도 제어
    // if (this.keys.has('w')) this.speed += this.speedIncrement;
    // if (this.keys.has('s')) this.speed -= this.speedIncrement;
    if (this.keys.has('w')) this.speed = 1;
    if (this.keys.has('s')) this.speed = -1;

    
    // 물리 시뮬레이션 - 속도
    // this.speed *= this.dragFactor;
    this.speed = THREE.MathUtils.clamp(this.speed, this.minSpeed, this.maxSpeed);
    
    // 롤 제어
    if (this.keys.has('a')) this.targetRoll += this.rotationSpeed;
    if (this.keys.has('d')) this.targetRoll -= this.rotationSpeed;
    
    // 요 제어
    if (this.keys.has('arrowleft')) this.targetYaw += this.rotationSpeed;
    if (this.keys.has('arrowright')) this.targetYaw -= this.rotationSpeed;
    
    // 피치 추가 제어
    if (this.keys.has('arrowup')) this.targetPitch -= this.rotationSpeed;
    if (this.keys.has('arrowdown')) this.targetPitch += this.rotationSpeed;
    console.log(this.targetPitch);
    console.log(this.camera.position);
    

    // 물리 시뮬레이션 - 회전
    this.targetRoll *= 0.95;
    
    // 목표 피치 각도 제한 (짐벌락 방지를 위해 ±89.99도로 제한)
    const pitchLimit = Math.PI / 2 - 0.01;  // 약 89.99도
    this.targetPitch = Math.max(-pitchLimit, Math.min(pitchLimit, this.targetPitch));

    // 부드러운 회전 보간
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, this.lerpFactor);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, this.lerpFactor);
    this.roll = THREE.MathUtils.lerp(this.roll, this.targetRoll, this.lerpFactor);

    // 회전 적용
    const rotation = new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ');
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    this.plane.quaternion.copy(quaternion);

    // 이동 방향 계산 및 적용
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.plane.quaternion);
    this.plane.position.add(direction.multiplyScalar(this.speed));

    // 부드러운 카메라 추적
    const cameraOffset = new THREE.Vector3(0, 2, 8).applyQuaternion(this.plane.quaternion);
    const targetCameraPos = this.plane.position.clone().add(cameraOffset);
    this.camera.position.lerp(targetCameraPos, this.lerpFactor);
    this.camera.lookAt(this.plane.position);

    this.renderer.render(this.scene, this.camera);
  };

  public getSpeed(): number {
    return this.speed;
  }

  public getPosition(): THREE.Vector3 {
    if (!this.plane) {
      return new THREE.Vector3(0, 0, 0);
    }
    return this.plane.position.clone(); // 외부에서 수정 못하게 복제
  }
} 
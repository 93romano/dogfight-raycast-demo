// client/components/MultiplayerScene.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SocketManager, PlayerState, MovementEvent } from '../network/SocketManager';
import { PlayerIdInput } from './PlayerIdInput';

// 컴포넌트 import
import { CameraController } from './camera/CameraController';
import { CameraUI } from './camera/CameraUI';
import { FlightPhysics } from './physics/FlightPhysics';
import { WeaponSystem } from './weapons/WeaponSystem';
import { GameUI, WeaponStatus } from './ui/GameUI';
import { CoordinateSystem } from './ui/CoordinateSystem';
import { PlayerManager } from './network/PlayerManager';

export class MultiplayerScene {
  // Core Three.js components
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private localPlane: THREE.Group;

  // Network
  private socket: SocketManager | null = null;
  private playerIdInput: PlayerIdInput | null = null;

  // Input handling
  private keys: Set<string> = new Set();
  private isPointerLocked = false;
  private mouseSensitivity = 0.002;

  // Game state
  private lastStateUpdate = 0;
  private lastMovementTime = 0;
  private readonly movementEventInterval = 5000;
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private lastRotation: THREE.Quaternion = new THREE.Quaternion();
  private positionChangeThreshold = 0.5;
  private rotationChangeThreshold = 0.05;
  private lastLogTime = 0;

  // Input state tracking
  private lastInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
  };
  private inputChanged = false;

  // Components
  private cameraController: CameraController;
  private cameraUI: CameraUI;
  private flightPhysics: FlightPhysics;
  private weaponSystem: WeaponSystem;
  private gameUI: GameUI;
  private coordinateSystem: CoordinateSystem;
  private playerManager: PlayerManager;

  constructor(canvas: HTMLCanvasElement) {
    // Initialize Three.js core
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(40, 40, 40);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Initialize components
    this.initializeComponents();
    this.initializeScene();
    this.initializeEvents();

    window.addEventListener('resize', this.onResize);
  }

  private initializeComponents() {
    this.cameraController = new CameraController(this.camera);
    this.cameraUI = new CameraUI(this.cameraController);
    this.flightPhysics = new FlightPhysics();
    this.gameUI = new GameUI();
    this.coordinateSystem = new CoordinateSystem(this.scene);
    this.playerManager = new PlayerManager(this.scene);
    
    this.weaponSystem = new WeaponSystem(
      this.scene,
      this.camera,
      this.playerManager.getOtherPlayers(),
      (targetPlayerId, damage, hitPoint, distance) => {
        if (this.socket) {
          this.socket.sendHit(parseInt(targetPlayerId), damage, hitPoint, distance);
        }
      }
    );

    // Set up camera controller callback
    this.cameraController.setUpdateDisplayCallback(() => {
      this.cameraUI.updateDisplay(this.cameraController.getState());
    });
  }

  private initializeScene() {
    this.coordinateSystem.initialize();
    this.initLights();
    this.showPlayerIdInput();
    this.loadPlaneModel();

    // Initialize health UI after a short delay
    setTimeout(() => {
      this.gameUI.updateHealthUI();
    }, 100);
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

  private async loadPlaneModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('/assets/models/Jet.glb');
      const plane = gltf.scene;
      plane.scale.set(0.5, 0.5, 0.5);
      plane.position.set(0, 0, 0);
      
      if (plane.children[0]) {
        plane.children[0].rotation.y = Math.PI;
      }
      
      this.scene.add(plane);
      this.localPlane = plane;
    } catch (error) {
      console.error('Error loading plane model:', error);
      this.localPlane = this.createBasicPlane(0x3399ff);
      this.scene.add(this.localPlane);
    }
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

  private initializeEvents() {
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    
    document.addEventListener('click', (event) => {
      console.log('🎯 Mouse clicked', event);
      if (this.isPointerLocked) {
        this.weaponSystem.shoot();
      }
    });
    
    document.addEventListener('mousemove', (event) => {
      if (this.isPointerLocked) {
        this.flightPhysics.handleMouseInput(event.movementX, event.movementY, this.mouseSensitivity);
      }
    });
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
        (id, state) => this.playerManager.addRemotePlayer(id, state),
        (id, state) => this.playerManager.updateRemotePlayer(id, state),
        (id) => this.playerManager.removeRemotePlayer(id),
        (players) => {
          console.log('📋 Received all players:', players);
          Object.entries(players).forEach(([id, state]) => {
            if (this.socket && id !== this.socket.getPlayerId()?.toString()) {
              this.playerManager.addRemotePlayer(id, state);
            }
          });
          resolve();
        },
        (id, event) => this.handleRemotePlayerMovement(id, event),
        (attackerId, victimId, damage, victimHealth) => this.handlePlayerHit(attackerId, victimId, damage, victimHealth),
        (victimId, attackerId, respawnPosition) => this.handlePlayerDeath(victimId, attackerId, respawnPosition)
      );

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
        setTimeout(checkConnection, 100);
        
        setTimeout(() => {
          if (!this.socket?.isConnected() || !this.socket?.getPlayerId()) {
            reject(new Error('서버 연결 시간이 초과되었습니다.'));
          }
        }, 10000);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  private showError(message: string): void {
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
    
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 5000);
  }

  private handleInput() {
    const currentInputState = {
      forward: this.keys.has('KeyW'),
      backward: this.keys.has('KeyS'),
      left: this.keys.has('KeyA'),
      right: this.keys.has('KeyD'),
      up: this.keys.has('ArrowUp'),
      down: this.keys.has('ArrowDown')
    };

    this.inputChanged = 
      currentInputState.forward !== this.lastInputState.forward ||
      currentInputState.backward !== this.lastInputState.backward ||
      currentInputState.left !== this.lastInputState.left ||
      currentInputState.right !== this.lastInputState.right ||
      currentInputState.up !== this.lastInputState.up ||
      currentInputState.down !== this.lastInputState.down;

    this.lastInputState = { ...currentInputState };

    // Handle arrow keys
    if (this.keys.has('ArrowLeft')) this.flightPhysics.adjustYaw(0.03);
    if (this.keys.has('ArrowRight')) this.flightPhysics.adjustYaw(-0.03);
    if (this.keys.has('ArrowUp')) this.flightPhysics.adjustPitch(-0.03);
    if (this.keys.has('ArrowDown')) this.flightPhysics.adjustPitch(0.03);
  }

  private sendMovementEvent() {
    if (!this.localPlane || !this.socket) return;

    const now = performance.now();
    
    if ((now - this.lastMovementTime) >= this.movementEventInterval) {
      const movementEvent: MovementEvent = {
        type: 'movement',
        input: this.lastInputState,
        position: this.localPlane.position.toArray(),
        rotation: this.localPlane.quaternion.toArray(),
        speed: this.flightPhysics.getSpeed()
      };

      console.log(`🎮 Sending movement event every 5 seconds - Player ID: ${this.socket.getSocketId()}`);
      
      this.socket.sendMovementEvent(movementEvent);
      this.lastMovementTime = now;
      this.inputChanged = false;
    }
  }

  private checkPositionChange() {
    if (!this.localPlane || !this.socket) return;

    const positionChanged = this.localPlane.position.distanceTo(this.lastPosition) > this.positionChangeThreshold;
    const rotationChanged = this.localPlane.quaternion.angleTo(this.lastRotation) > this.rotationChangeThreshold;

    if (positionChanged || rotationChanged) {
      const now = Date.now();
      if (!this.lastLogTime || now - this.lastLogTime > 5000) {
        console.log(`🎮 Position changed - Player ID: ${this.socket.getSocketId()}`);
        this.lastLogTime = now;
      }
      
      this.socket.sendState({
        position: this.localPlane.position.toArray(),
        rotation: this.localPlane.quaternion.toArray()
      });

      this.lastPosition.copy(this.localPlane.position);
      this.lastRotation.copy(this.localPlane.quaternion);
    }
  }

  private handleRemotePlayerMovement(id: string, event: MovementEvent) {
    this.playerManager.updateRemotePlayer(id, {
      position: event.position,
      rotation: event.rotation
    });
  }

  private handlePlayerHit(attackerId: string, victimId: string, damage: number, victimHealth: number) {
    console.log(`🎯 Player ${attackerId} hit Player ${victimId} for ${damage} damage! Victim health: ${victimHealth}`);
    
    if (this.socket && victimId === this.socket.getPlayerId()?.toString()) {
      const isDead = this.gameUI.takeDamage(damage);
      if (isDead) {
        this.handleLocalPlayerDeath();
      }
    }
    
    this.playerManager.showPlayerHitEffect(victimId);
  }

  private handlePlayerDeath(victimId: string, attackerId: string, respawnPosition: number[]) {
    console.log(`💀 Player ${victimId} was killed by Player ${attackerId}`);
    // PlayerManager에서 처리됨
  }

  private handleLocalPlayerDeath() {
    if (this.localPlane) {
      this.localPlane.position.set(0, 10, 0);
      this.localPlane.quaternion.set(0, 0, 0, 1);
    }
    
    this.gameUI.respawn();
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public update = () => {
    console.log('🎮 Updating multiplayer scene');
    if (!this.localPlane) return;

    this.handleInput();

    const now = performance.now();
    const deltaTime = (now - this.lastStateUpdate) / 1000;
    this.lastStateUpdate = now;

    // Update physics
    this.flightPhysics.updatePhysics(deltaTime, this.localPlane, this.lastInputState);

    // Update weapon system
    this.weaponSystem.updateVisualBullets(deltaTime);

    // Update camera
    if (this.localPlane) {
      const cameraOffset = new THREE.Vector3(0, 2, 8);
      this.cameraController.followTarget(this.localPlane.position, cameraOffset, 0.1);
    }

    // Update UI
    const weaponStatus: WeaponStatus = {
      isReady: performance.now() - this.weaponSystem.getLastShotTime() >= this.weaponSystem.getShotCooldown(),
      cooldownRemaining: this.weaponSystem.getShotCooldown() - (performance.now() - this.weaponSystem.getLastShotTime()),
      shotsFired: this.weaponSystem.getShotsFired()
    };
    
    this.gameUI.updateWeaponHUD(weaponStatus);
    this.cameraUI.updateDisplay(this.cameraController.getState());

    // Network updates
    this.sendMovementEvent();
    this.checkPositionChange();

    this.renderer.render(this.scene, this.camera);
  };

  // Public getters for compatibility
  public getSpeed(): number {
    return this.flightPhysics.getSpeed();
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
}

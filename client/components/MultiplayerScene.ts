// client/components/MultiplayerScene.ts

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SocketManager, PlayerState, MovementEvent } from '../network/SocketManager';
import { PlayerIdInput } from './PlayerIdInput';

// 분리된 컴포넌트들 import
import { WeaponSystem } from './weapons/WeaponSystem';
import { InputManager } from './input/InputManager';
import { FlightPhysics } from './physics/FlightPhysics';
import { Environment } from './environment/Environment';
import { NetworkManager } from './network/NetworkManager';
import { StateSync } from './network/StateSync';

export class MultiplayerScene {
  // Core THREE.js 객체들
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private localPlane: THREE.Group;
  public otherPlayers: Map<string, THREE.Group> = new Map();
  
  // 네트워크 관련
  private playerIdInput: PlayerIdInput | null = null;

  // 분리된 시스템들
  private weaponSystem: WeaponSystem;
  private inputManager: InputManager;
  private flightPhysics: FlightPhysics;
  private environment: Environment;
  private networkManager: NetworkManager;
  private stateSync: StateSync;
  
  // 상태 추적 변수들
  private lastStateUpdate = 0;
  
  // 체력 시스템
  private health = 100;
  private readonly maxHealth = 100;
  
  // 카메라 추적
  private readonly lerpFactor = 0.5;

  constructor(canvas: HTMLCanvasElement) {
    // Core THREE.js 초기화
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 분리된 시스템들 초기화
    this.initializeManagers(canvas);
    this.initializeEnvironment();
    this.initializeNetwork();
    
    // 게임 초기화
    this.showPlayerIdInput();
    this.loadPlaneModel();
    // this.createCrosshair();

    // 체력 UI 설정
    setTimeout(() => {
      this.updateHealthUI();
    }, 100);

    window.addEventListener('resize', this.onResize);
  }

  private initializeManagers(canvas: HTMLCanvasElement) {
    // InputManager 초기화
    this.inputManager = new InputManager(canvas);
    this.inputManager.setOnShootCallback(() => {
      this.weaponSystem.shoot(this.localPlane);
    });
    
    // FlightPhysics 초기화
    this.flightPhysics = new FlightPhysics();
    
    // WeaponSystem 초기화 (나중에 localPlane이 로드된 후)
    this.weaponSystem = new WeaponSystem(
      this.scene,
      this.camera,
      this.otherPlayers,
      (targetId, damage, hitPoint, distance) => {
        if (this.networkManager) {
          this.networkManager.sendHit(
            parseInt(targetId),
            damage,
            hitPoint.toArray(),
            distance
          );
        }
      }
    );
  }

  private async initializeEnvironment() {
    this.environment = new Environment(this.scene);
    await this.environment.initialize();
  }

  private initializeNetwork() {
    this.networkManager = new NetworkManager({
      onPlayerJoin: (id, state) => this.addRemotePlayer(id, state),
      onPlayerUpdate: (id, state) => this.updateRemotePlayer(id, state),
      onPlayerLeave: (id) => this.removeRemotePlayer(id),
      onAllPlayers: (players) => {
        console.log('📋 Received all players:', players);
        Object.entries(players).forEach(([id, state]) => {
          if (this.networkManager && id !== this.networkManager.getPlayerId()?.toString()) {
            this.addRemotePlayer(id, state);
          }
        });
      },
      onPlayerMovement: (id, event) => this.handleRemotePlayerMovement(id, event),
      onPlayerHit: (attackerId, victimId, damage, victimHealth) => 
        this.handlePlayerHit(attackerId, victimId, damage, victimHealth),
      onPlayerDeath: (victimId, attackerId, respawnPosition) => 
        this.handlePlayerDeath(victimId, attackerId, respawnPosition)
    });

    this.stateSync = new StateSync({
      positionThreshold: 0.1,
      rotationThreshold: 0.01,
      updateInterval: 16,  // 60Hz (16ms)
      movementEventInterval: 100  // 100ms
    });

    this.stateSync.setStateChangeCallback((state) => {
      this.networkManager.sendState(state);
    });

    this.stateSync.setMovementEventCallback((event) => {
      this.networkManager.sendMovementEvent(event);
    });
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

  private showPlayerIdInput() {
    this.playerIdInput = new PlayerIdInput({
      onAuthentication: async (username: string) => {
        console.log('🎯 Username submitted:', username);
        
        try {
          await this.networkManager.connect(username);

          // 인증 성공 후 조준점 생성
          this.createCrosshair();
          
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

  // updatePhysics 개선 (FlightPhysics 사용)
  private updatePhysics(deltaTime: number) {
    if (!this.localPlane) return;

    // InputManager에서 회전 값 가져오기
    const targetRotation = this.inputManager.updateRotation();
    
    // InputManager에서 입력 상태 가져오기
    const inputState = this.inputManager.getCurrentInputState();

    // FlightPhysics로 물리 업데이트 위임
    this.flightPhysics.updatePhysics(deltaTime, inputState, targetRotation, this.localPlane);
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public update = () => {
    if (!this.localPlane) return;

    const now = performance.now();
    const deltaTime = (now - this.lastStateUpdate) / 1000;
    this.lastStateUpdate = now;

    this.updatePhysics(deltaTime);

    // WeaponSystem 업데이트
    this.weaponSystem.update(deltaTime);

    // 네트워크 상태 동기화
    const inputState = this.inputManager.getCurrentInputState();
    this.stateSync.update(this.localPlane, inputState, this.flightPhysics.getCurrentSpeed());

    // 무기 상태 업데이트
    this.updateWeaponHUD();

    // 카메라 추적
      const cameraOffset = new THREE.Vector3(0, 2, 8).applyQuaternion(this.localPlane.quaternion);
      const targetCameraPos = this.localPlane.position.clone().add(cameraOffset);
      this.camera.position.lerp(targetCameraPos, this.lerpFactor);
      this.camera.lookAt(this.localPlane.position);

    this.renderer.render(this.scene, this.camera);
  };

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
      const status = this.weaponSystem.getStatus();
      
      if (!status.isReady) {
        weaponStatus.textContent = `Reloading (${Math.ceil(status.cooldownRemaining / 100) / 10}s)`;
        weaponStatus.style.color = '#FFC107';
      } else {
        weaponStatus.textContent = 'Ready';
        weaponStatus.style.color = '#4CAF50';
      }
    }
    
    if (shotsFiredElement) {
      shotsFiredElement.textContent = this.weaponSystem.getStatus().shotsFired.toString();
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
    return this.flightPhysics.getSpeed();
  }

  public getPosition(): THREE.Vector3 {
    return this.localPlane ? this.localPlane.position.clone() : new THREE.Vector3();
  }

  public getActiveKeys(): Set<string> {
    return this.inputManager.getActiveKeys();
  }

  public sendState(state: PlayerState) {
    console.log('[DEBUG] sendState called', state);
    this.networkManager?.sendState(state);
  }

  // 원격 플레이어 관련 메서드들 (기존과 동일)
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

      // 로컬 플레이어와 같은 회전 적용
      if (mesh.children[0]) {
        mesh.children[0].rotation.y = Math.PI;
      }

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
      
      // 더 빠른 보간으로 반응성 개선
      mesh.position.lerp(targetPosition, 0.3);
      mesh.quaternion.slerp(targetQuaternion, 0.3);
      
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

  private handleRemotePlayerMovement(id: string, event: MovementEvent) {
    const mesh = this.otherPlayers.get(id);
    if (mesh) {
      // 움직임 이벤트에 따라 원격 플레이어 업데이트
      const targetPosition = new THREE.Vector3().fromArray(event.position);
      const targetQuaternion = new THREE.Quaternion().fromArray(event.rotation);
      
      // 빠른 반응을 위한 보간
      mesh.position.lerp(targetPosition, 0.4);
      mesh.quaternion.slerp(targetQuaternion, 0.4);
      
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
    if (this.networkManager && victimId === this.networkManager.getPlayerId()?.toString()) {
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

import * as THREE from 'three';
import { MovementEvent, PlayerState } from '../network/SocketManager';
import { PlayerIdInput } from './PlayerIdInput';
import { ModelCache } from './assets/ModelCache';
import { Environment } from './environment/Environment';
import { InputManager } from './input/InputManager';
import { NetworkManager } from './network/NetworkManager';
import { StateSync } from './network/StateSync';
import { RemotePlayerManager } from './players/RemotePlayerManager';
import { FlightPhysics } from './physics/FlightPhysics';
import { GameHud } from './ui/GameHud';
import { GameOverOverlay } from './ui/GameOverOverlay';
import { MainMenu } from './ui/MainMenu';
import { WeaponSystem } from './weapons/WeaponSystem';
import { createStylizedJet, enableShadows } from './assets/PlaneFactory';

export interface SceneDebugSnapshot {
  speed: number;
  position: THREE.Vector3;
  activeKeys: Set<string>;
}

export class MultiplayerScene {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly modelCache = new ModelCache();
  private readonly remotePlayers: RemotePlayerManager;
  private readonly weaponSystem: WeaponSystem;
  private readonly inputManager: InputManager;
  private readonly flightPhysics: FlightPhysics;
  private readonly environment: Environment;
  private readonly networkManager: NetworkManager;
  private readonly stateSync: StateSync;

  private localPlane: THREE.Group | null = null;
  private playerIdInput: PlayerIdInput | null = null;
  private mainMenu: MainMenu | null = null;
  private gameOverOverlay: GameOverOverlay | null = null;
  private kills = 0;
  private deaths = 0;
  private lastFrameTime = performance.now();
  private health = 100;
  private readonly maxHealth = 100;
  private readonly lerpFactor = 0.5;
  private firstPersonUntil = 0;
  private firstPersonStart = 0;
  private readonly fpDurationMs = 3000;
  private readonly fpTransitionMs = 250;
  private readonly defaultFov = 75;
  private readonly firstPersonFov = 65;
  private readonly cockpitOffset = new THREE.Vector3(0, 0.25, -1.2);
  private shootShakeEnd = 0;
  private readonly shootShakeDuration = 200;
  private readonly shakeAmplitude = 0.02;

  // Pre-allocated scratch vectors to avoid per-frame allocations
  private readonly _scratchOffset = new THREE.Vector3();
  private readonly _scratchTarget = new THREE.Vector3();
  private readonly _scratchJitter = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, private readonly hud: GameHud) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 6000);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    this.remotePlayers = new RemotePlayerManager(this.scene, this.modelCache);
    this.inputManager = new InputManager(canvas);
    this.flightPhysics = new FlightPhysics();
    this.environment = new Environment(this.scene);

    this.weaponSystem = new WeaponSystem(
      this.scene,
      this.camera,
      this.remotePlayers.getPlayerMap(),
      (targetId, damage, hitPoint, distance) => {
        this.networkManager.sendHit(parseInt(targetId, 10), damage, hitPoint.toArray(), distance);
      }
    );

    this.networkManager = new NetworkManager({
      onPlayerJoin: (id, state) => void this.remotePlayers.addPlayer(id, state),
      onPlayerUpdate: (id, state) => this.remotePlayers.updatePlayer(id, state),
      onPlayerLeave: (id) => this.remotePlayers.removePlayer(id),
      onAllPlayers: (players) => {
        Object.entries(players).forEach(([id, state]) => {
          if (id !== this.networkManager.getPlayerId()?.toString()) {
            void this.remotePlayers.addPlayer(id, state);
          }
        });
      },
      onPlayerMovement: (id, event) => this.handleRemotePlayerMovement(id, event),
      onPlayerHit: (attackerId, victimId, damage, victimHealth) =>
        this.handlePlayerHit(attackerId, victimId, damage, victimHealth),
      onPlayerDeath: (victimId, attackerId, respawnPosition) =>
        this.handlePlayerDeath(victimId, attackerId, respawnPosition),
      onDisconnected: () => {
        this.hud.setPlayerId(undefined, true);
      }
    });

    this.stateSync = new StateSync({
      positionThreshold: 0.1,
      rotationThreshold: 0.01,
      updateInterval: 16,
      movementEventInterval: 100
    });

    this.bindSystems();
    void this.initializeEnvironment();
    void this.loadLocalPlane();

    this.gameOverOverlay = new GameOverOverlay({
      onRespawn: () => this.respawnLocalPlayer(),
      onMainMenu: () => window.location.reload()
    });
    this.showMainMenu();
    this.hud.updateHealth(this.health, this.maxHealth);
    this.hud.updateWeapon(this.weaponSystem.getStatus());
    this.refreshScore();

    window.addEventListener('resize', this.onResize);
  }

  public update = (): void => {
    const localPlane = this.localPlane;
    if (!localPlane) {
      return;
    }

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const perfHeavy = deltaTime * 1000 > 50;

    this.updatePhysics(deltaTime, localPlane);
    this.weaponSystem.update(deltaTime);

    const inputState = this.inputManager.getCurrentInputState();
    this.stateSync.update(localPlane, inputState, this.flightPhysics.getCurrentSpeed());
    this.hud.updateWeapon(this.weaponSystem.getStatus());

    // keep the key light + its shadow frustum following the aircraft
    const sun = this.environment.getLighting().getSunLight();
    if (sun) {
      sun.position.set(
        localPlane.position.x + 30,
        localPlane.position.y + 60,
        localPlane.position.z + 25
      );
      sun.target.position.copy(localPlane.position);
    }

    const inFirstPerson = now < this.firstPersonUntil;
    localPlane.visible = !inFirstPerson;

    if (inFirstPerson) {
      this.updateFirstPersonCamera(now, perfHeavy, inputState, localPlane);
    } else {
      this.updateThirdPersonCamera(perfHeavy, localPlane);
    }

    this.renderer.render(this.scene, this.camera);
  };

  public getDebugSnapshot(): SceneDebugSnapshot {
    return {
      speed: this.flightPhysics.getSpeed(),
      position: this.localPlane ? this.localPlane.position.clone() : new THREE.Vector3(),
      activeKeys: this.inputManager.getActiveKeys()
    };
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onResize);

    this.playerIdInput?.dispose();
    this.playerIdInput = null;

    this.mainMenu?.dispose();
    this.mainMenu = null;

    this.gameOverOverlay?.dispose();
    this.gameOverOverlay = null;

    this.stateSync.dispose();
    this.networkManager.disconnect();
    this.weaponSystem.dispose();
    this.inputManager.dispose();
    this.remotePlayers.dispose();

    if (this.localPlane) {
      this.scene.remove(this.localPlane);
      this.disposeLocalPlane(this.localPlane);
      this.localPlane = null;
    }

    this.environment.dispose();
    this.renderer.dispose();
  }

  private bindSystems(): void {
    this.inputManager.setOnShootCallback(() => {
      if (!this.localPlane) {
        return;
      }

      const didShoot = this.weaponSystem.shoot(this.localPlane);
      if (!didShoot) {
        return;
      }

      const now = performance.now();
      this.firstPersonStart = now;
      this.firstPersonUntil = now + this.fpDurationMs;
      this.shootShakeEnd = now + this.shootShakeDuration;
    });

    this.inputManager.setOnReloadCallback(() => {
      this.weaponSystem.reload();
    });

    this.stateSync.setStateChangeCallback((state) => {
      this.networkManager.sendState(state);
    });

    this.stateSync.setMovementEventCallback((event) => {
      this.networkManager.sendMovementEvent(event);
      this.hud.recordMovementEventSent();
    });
  }

  private async initializeEnvironment(): Promise<void> {
    await this.environment.initialize();
  }

  private async loadLocalPlane(): Promise<void> {
    try {
      this.localPlane = await this.modelCache.createJetInstance();
    } catch (error) {
      console.error('Error loading plane model:', error);
      this.localPlane = createStylizedJet();
      this.localPlane.userData.isFallbackPlane = true;
    }

    enableShadows(this.localPlane);
    this.scene.add(this.localPlane);
  }

  private showMainMenu(): void {
    this.mainMenu = new MainMenu({
      onStart: () => this.showPlayerIdInput()
    });
  }

  private enterPlayingState(): void {
    document.body.classList.remove('state-boot', 'state-menu', 'state-login');
    document.body.classList.add('state-playing');
    this.refreshScore();
  }

  private refreshScore(): void {
    this.hud.updateScore(this.kills, this.deaths, this.kills * 100);
  }

  private showPlayerIdInput(): void {
    this.playerIdInput = new PlayerIdInput({
      onAuthentication: async (username: string) => {
        try {
          await this.networkManager.connect(username);
          this.hud.setPlayerId(this.networkManager.getPlayerId() ?? undefined);
          this.hud.ensureCrosshair();
          this.enterPlayingState();

          return {
            success: true,
            username
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
        this.hud.showError(`인증 중 오류가 발생했습니다: ${error.message}`);
      }
    });
  }

  private updatePhysics(deltaTime: number, localPlane: THREE.Group): void {
    const targetRotation = this.inputManager.updateRotation();
    const inputState = this.inputManager.getCurrentInputState();

    this.flightPhysics.updatePhysics(deltaTime, inputState, targetRotation, localPlane);
  }

  private updateFirstPersonCamera(
    now: number,
    perfHeavy: boolean,
    inputState: ReturnType<InputManager['getCurrentInputState']>,
    localPlane: THREE.Group
  ): void {
    const transitionProgress = Math.min(1, (now - this.firstPersonStart) / this.fpTransitionMs);
    const fpTargetPos = this._scratchOffset.copy(this.cockpitOffset)
      .applyQuaternion(localPlane.quaternion)
      .add(localPlane.position);

    if (perfHeavy) {
      this.camera.position.copy(fpTargetPos);
    } else if (transitionProgress < 1) {
      this.camera.position.lerp(fpTargetPos, transitionProgress);
    } else {
      this.camera.position.lerp(fpTargetPos, 0.4);
    }

    const lookTarget = this._scratchTarget.set(0, 0, -10)
      .applyQuaternion(localPlane.quaternion)
      .add(localPlane.position);

    if (!perfHeavy && now < this.shootShakeEnd) {
      const shakePhase = (now / 33.3) % (Math.PI * 2);
      this._scratchJitter.set(
        Math.sin(shakePhase * 1.7),
        Math.sin(shakePhase * 2.3 + 1.0),
        Math.sin(shakePhase * 1.9 + 2.0)
      ).multiplyScalar(this.shakeAmplitude);
      this.camera.position.add(this._scratchJitter);
    }

    if (!perfHeavy && (inputState.forward || inputState.up)) {
      const accelPhase = (now / 40) % (Math.PI * 2);
      this._scratchJitter.set(
        Math.sin(accelPhase * 1.3) * 0.5,
        Math.sin(accelPhase * 2.1 + 0.8),
        0
      ).multiplyScalar(this.shakeAmplitude * 0.6);
      this.camera.position.add(this._scratchJitter);
    }

    this.camera.lookAt(lookTarget);
    this.camera.fov = perfHeavy
      ? this.firstPersonFov
      : THREE.MathUtils.lerp(this.camera.fov, this.firstPersonFov, 0.3);
    this.camera.updateProjectionMatrix();
  }

  private updateThirdPersonCamera(perfHeavy: boolean, localPlane: THREE.Group): void {
    const targetCameraPos = this._scratchOffset.set(0, 2, 8)
      .applyQuaternion(localPlane.quaternion)
      .add(localPlane.position);

    if (perfHeavy) {
      this.camera.position.copy(targetCameraPos);
    } else {
      this.camera.position.lerp(targetCameraPos, this.lerpFactor);
    }

    this.camera.lookAt(localPlane.position);
    this.camera.fov = perfHeavy
      ? this.defaultFov
      : THREE.MathUtils.lerp(this.camera.fov, this.defaultFov, 0.2);
    this.camera.updateProjectionMatrix();
  }

  private handleRemotePlayerMovement(id: string, event: MovementEvent): void {
    this.remotePlayers.handleMovement(id, event);
  }

  private handlePlayerHit(attackerId: string, victimId: string, damage: number, victimHealth: number): void {
    console.log(`Player ${attackerId} hit Player ${victimId} for ${damage} damage`);

    if (victimId === this.networkManager.getPlayerId()?.toString()) {
      this.health = Math.max(0, Math.min(this.maxHealth, victimHealth));
      this.hud.updateHealth(this.health, this.maxHealth);
      this.hud.showDamageEffect();

      if (this.health <= 0) {
        this.handleLocalPlayerDeath(attackerId);
      }
    }

    this.remotePlayers.showHitEffect(victimId);
  }

  private handlePlayerDeath(victimId: string, attackerId: string, respawnPosition: number[]): void {
    console.log(`Player ${victimId} was killed by Player ${attackerId}`);

    const localId = this.networkManager.getPlayerId()?.toString();
    if (attackerId === localId && victimId !== localId) {
      this.kills++;
      this.refreshScore();
    }

    this.remotePlayers.respawnPlayer(victimId, respawnPosition);
  }

  private handleLocalPlayerDeath(attackerId?: string): void {
    this.deaths++;
    this.refreshScore();
    this.gameOverOverlay?.show({
      killedBy: attackerId ? `PILOT_${attackerId}` : 'UNKNOWN',
      kills: this.kills,
      deaths: this.deaths,
      score: this.kills * 100
    });
  }

  private respawnLocalPlayer(): void {
    if (this.localPlane) {
      this.localPlane.position.set(0, 10, 0);
      this.localPlane.quaternion.set(0, 0, 0, 1);
    }

    this.health = this.maxHealth;
    this.hud.updateHealth(this.health, this.maxHealth);
    this.enterPlayingState();
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private disposeLocalPlane(localPlane: THREE.Group): void {
    localPlane.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) {
        return;
      }

      // GLB instances share template geometry (do not dispose); procedural and
      // afterburner meshes own unique geometry and must be released.
      if (localPlane.userData.isFallbackPlane || child.userData.disposable) {
        child.geometry.dispose();
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
        return;
      }

      child.material.dispose();
    });
  }
}

/**
 * DEV-ONLY screen preview harness — NOT part of the production build.
 *
 * Renders a single UI screen (or the real 3D scene) in isolation so it can be
 * viewed / screenshotted without the game server (WebSocket / Redis / Postgres).
 * It reuses the exact fonts, CSS tokens and HUD markup from index.html via
 * preview.html, and drives the real components / GameHud / Environment with
 * sample data.
 *
 * Usage:  /preview.html?screen=menu | login | hud | gameover | scene
 *         /preview.html?screen=scene&plane=fallback   (procedural jet)
 */
import * as THREE from 'three';
import { MainMenu } from './components/ui/MainMenu';
import { PlayerIdInput } from './components/PlayerIdInput';
import { GameOverOverlay } from './components/ui/GameOverOverlay';
import { GameHud } from './components/ui/GameHud';
import { Environment } from './components/environment/Environment';
import { ModelCache } from './components/assets/ModelCache';
import { createStylizedJet, enableShadows } from './components/assets/PlaneFactory';
import type { WeaponStatus } from './components/weapons/WeaponSystem';

const params = new URLSearchParams(window.location.search);
const screen = params.get('screen') ?? 'menu';

/** Drive the real in-game HUD with representative mid-combat telemetry. */
function showHud(): void {
  document.body.className = 'state-playing';

  const hud = new GameHud();
  hud.setPlayerId(77);
  hud.updateFrame(412.7, new THREE.Vector3(1532.4, 2450, -880.2), new Set(['KeyW', 'KeyD']));
  hud.updateHealth(72, 100);
  hud.updateScore(7, 3, 700);

  const weapon: WeaponStatus = {
    isReady: true,
    cooldownRemaining: 0,
    shotsFired: 12,
    ammo: 18,
    maxAmmo: 30,
    isReloading: false,
    reloadTimeRemaining: 0,
    reloadDuration: 2000
  };
  hud.updateWeapon(weapon);
  hud.ensureCrosshair();
}

/** Render the real Environment + a plane to verify the in-game look. */
async function showScene(): Promise<void> {
  document.getElementById('preview-scene')?.remove();

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;';
  document.body.insertBefore(canvas, document.body.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 6000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  const environment = new Environment(scene);
  await environment.initialize();

  let plane: THREE.Group;
  if (params.get('plane') === 'fallback') {
    plane = createStylizedJet();
  } else {
    try {
      plane = await new ModelCache().createJetInstance();
    } catch {
      plane = createStylizedJet();
    }
  }
  enableShadows(plane);
  plane.position.set(0, 2.6, 0);
  plane.rotation.y = -0.5;
  scene.add(plane);

  // rear-3/4 hero angle so the afterburner glow and wings both read,
  // flying low over the tactical grid floor as it recedes to the horizon
  camera.position.set(5, 4.4, 7);
  camera.lookAt(0, 2, 0);

  const animate = (): void => {
    requestAnimationFrame(animate);
    const t = performance.now();
    plane.rotation.z = Math.sin(t / 1700) * 0.12;
    renderer.render(scene, camera);
  };
  animate();
}

switch (screen) {
  case 'login':
    document.body.className = 'state-boot';
    new PlayerIdInput({
      onAuthentication: async () => ({ success: true, playerId: 77 }),
      onError: () => {
        /* preview: no-op */
      }
    });
    break;

  case 'hud':
    showHud();
    break;

  case 'gameover': {
    const overlay = new GameOverOverlay({
      onRespawn: () => {
        /* preview: no-op */
      },
      onMainMenu: () => {
        /* preview: no-op */
      }
    });
    overlay.show({ killedBy: 'PILOT_VIPER_77', kills: 7, deaths: 3, score: 700 });
    break;
  }

  case 'scene':
    void showScene();
    break;

  case 'menu':
  default:
    new MainMenu({
      onStart: () => {
        /* preview: no-op */
      }
    });
    break;
}

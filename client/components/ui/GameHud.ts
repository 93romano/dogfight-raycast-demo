import * as THREE from 'three';
import { WeaponStatus } from '../weapons/WeaponSystem';

const INPUT_TO_ELEMENT: Array<[string, string]> = [
  ['KeyW', 'w'],
  ['KeyS', 's'],
  ['KeyA', 'a'],
  ['KeyD', 'd'],
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right']
];

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id) as T | null;
  if (!element) {
    throw new Error(`${id} element not found`);
  }

  return element;
}

export class GameHud {
  private readonly playerIdElement = requireElement<HTMLElement>('player-id');
  private readonly speedElement = requireElement<HTMLElement>('speed');
  private readonly positionElement = requireElement<HTMLElement>('position');
  private readonly healthFill = requireElement<HTMLElement>('health-fill');
  private readonly healthText = requireElement<HTMLElement>('health-text');
  private readonly weaponStatus = requireElement<HTMLElement>('weapon-status');
  private readonly shotsFiredElement = requireElement<HTMLElement>('shots-fired');
  private readonly ammoCount = requireElement<HTMLElement>('ammo-count');
  private readonly reloadStatus = requireElement<HTMLElement>('reload-status');
  private readonly reloadProgress = requireElement<HTMLElement>('reload-progress');
  private readonly reloadBar = requireElement<HTMLElement>('reload-bar');
  private readonly eventsSentElement = requireElement<HTMLElement>('events-sent');
  private readonly lastEventElement = requireElement<HTMLElement>('last-event');
  private readonly healthPctElement = document.getElementById('health-pct');
  private readonly altitudeElement = document.getElementById('altitude');
  private readonly scoreKillsElement = document.getElementById('score-kills');
  private readonly scoreDeathsElement = document.getElementById('score-deaths');
  private readonly scoreValueElement = document.getElementById('score-value');
  private readonly inputElements: Record<string, HTMLElement> = {};

  private eventsSent = 0;
  private crosshairElement: HTMLElement | null = null;
  private readonly transientElements = new Set<HTMLElement>();
  private readonly timeouts = new Set<number>();
  private lastSpeedText = '';
  private lastPositionText = '';
  private lastActiveKeys: Set<string> | null = null;
  private lastWeaponState = '';

  constructor() {
    INPUT_TO_ELEMENT.forEach(([, elementId]) => {
      const element = document.getElementById(`input-${elementId}`);
      if (element) {
        this.inputElements[elementId] = element as HTMLElement;
      }
    });
  }

  public updateFrame(speed: number, position: THREE.Vector3, activeKeys: Set<string>): void {
    const speedText = speed.toFixed(1);
    if (speedText !== this.lastSpeedText) {
      this.speedElement.textContent = speedText;
      this.lastSpeedText = speedText;
    }

    const posText = `[${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}]`;
    if (posText !== this.lastPositionText) {
      this.positionElement.textContent = posText;
      if (this.altitudeElement) {
        this.altitudeElement.textContent = position.y.toFixed(0);
      }
      this.lastPositionText = posText;
    }

    this.updateInputStatus(activeKeys);
  }

  public setPlayerId(playerId?: number, disconnected = false): void {
    if (playerId !== undefined) {
      this.playerIdElement.textContent = playerId.toString();
      return;
    }

    this.playerIdElement.textContent = disconnected ? '연결 끊김' : '...';
  }

  public recordMovementEventSent(): void {
    this.eventsSent++;
    this.eventsSentElement.textContent = this.eventsSent.toString();
    this.lastEventElement.textContent = new Date().toLocaleTimeString();
  }

  public updateHealth(health: number, maxHealth: number): void {
    const healthPercentage = (health / maxHealth) * 100;

    this.healthFill.style.width = `${healthPercentage}%`;
    this.healthText.textContent = `${health}/${maxHealth}`;

    let color = '#4CAF50';
    let glow = 'rgba(76, 175, 80, 0.6)';
    if (healthPercentage <= 30) {
      color = '#F44336';
      glow = 'rgba(244, 67, 54, 0.6)';
    } else if (healthPercentage <= 60) {
      color = '#FFC107';
      glow = 'rgba(255, 193, 7, 0.6)';
    }

    this.healthFill.style.background = color;
    this.healthFill.style.boxShadow = `0 0 6px ${glow}`;

    if (this.healthPctElement) {
      this.healthPctElement.textContent = `${Math.round(healthPercentage)}%`;
      this.healthPctElement.style.color = color;
    }
  }

  public updateScore(kills: number, deaths: number, score: number): void {
    if (this.scoreKillsElement) {
      this.scoreKillsElement.textContent = String(kills).padStart(2, '0');
    }
    if (this.scoreDeathsElement) {
      this.scoreDeathsElement.textContent = String(deaths).padStart(2, '0');
    }
    if (this.scoreValueElement) {
      this.scoreValueElement.textContent = String(score);
    }
  }

  public updateWeapon(status: WeaponStatus): void {
    const stateKey = `${status.ammo}|${status.isReloading}|${status.isReady}|${status.shotsFired}|${Math.round(status.cooldownRemaining / 100)}|${Math.round(status.reloadTimeRemaining / 100)}`;
    if (stateKey === this.lastWeaponState) {
      return;
    }
    this.lastWeaponState = stateKey;

    if (status.isReloading) {
      this.weaponStatus.textContent = 'Reloading';
      this.weaponStatus.style.color = '#FFC107';
    } else if (status.ammo === 0) {
      this.weaponStatus.textContent = 'Empty - Press R';
      this.weaponStatus.style.color = '#F44336';
    } else if (!status.isReady) {
      this.weaponStatus.textContent = `Cooldown (${Math.ceil(status.cooldownRemaining / 100) / 10}s)`;
      this.weaponStatus.style.color = '#FFC107';
    } else {
      this.weaponStatus.textContent = 'Ready';
      this.weaponStatus.style.color = '#4CAF50';
    }

    this.ammoCount.textContent = `${status.ammo}/${status.maxAmmo}`;
    if (status.ammo === 0) {
      this.ammoCount.style.color = '#F44336';
    } else if (status.ammo <= 10) {
      this.ammoCount.style.color = '#FFC107';
    } else {
      this.ammoCount.style.color = '#4CAF50';
    }

    if (status.isReloading) {
      const reloadProgressPercent =
        ((status.reloadDuration - status.reloadTimeRemaining) / status.reloadDuration) * 100;
      const remainingSeconds = (status.reloadTimeRemaining / 1000).toFixed(1);

      this.reloadStatus.style.display = 'block';
      this.reloadProgress.textContent = `${remainingSeconds}s`;
      this.reloadBar.style.width = `${reloadProgressPercent}%`;
    } else {
      this.reloadStatus.style.display = 'none';
    }

    this.shotsFiredElement.textContent = status.shotsFired.toString();
  }

  public ensureCrosshair(): void {
    const element = this.crosshairElement ?? document.getElementById('crosshair');
    if (element) {
      element.style.display = 'block';
      this.crosshairElement = element;
    }
  }

  public showDamageEffect(): void {
    const overlay = document.createElement('div');
    overlay.className = 'damage-overlay';
    this.trackTransientElement(overlay);

    overlay.addEventListener('animationend', () => {
      this.removeTransientElement(overlay);
    }, { once: true });

    document.body.appendChild(overlay);
  }

  public showError(message: string): void {
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

    this.trackTransientElement(errorDiv);
    document.body.appendChild(errorDiv);

    this.scheduleTimeout(() => {
      this.removeTransientElement(errorDiv);
    }, 5000);
  }

  public dispose(): void {
    if (this.crosshairElement) {
      this.crosshairElement.style.display = 'none';
    }
    this.crosshairElement = null;

    this.timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    this.timeouts.clear();

    this.transientElements.forEach((element) => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    this.transientElements.clear();
  }

  private updateInputStatus(activeKeys: Set<string>): void {
    const lastKeys = this.lastActiveKeys;
    INPUT_TO_ELEMENT.forEach(([keyCode, elementId]) => {
      const element = this.inputElements[elementId];
      if (!element) {
        return;
      }

      const active = activeKeys.has(keyCode);
      if (lastKeys && active === lastKeys.has(keyCode)) {
        return;
      }

      element.className = `input-status ${active ? 'input-active' : 'input-inactive'}`;
    });
    this.lastActiveKeys = new Set(activeKeys);
  }

  private trackTransientElement(element: HTMLElement): void {
    this.transientElements.add(element);
  }

  private removeTransientElement(element: HTMLElement): void {
    this.transientElements.delete(element);
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  private scheduleTimeout(callback: () => void, delayMs: number): void {
    const timeoutId = window.setTimeout(() => {
      this.timeouts.delete(timeoutId);
      callback();
    }, delayMs);

    this.timeouts.add(timeoutId);
  }
}

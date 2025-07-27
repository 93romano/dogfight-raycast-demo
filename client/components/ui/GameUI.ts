export interface HealthStatus {
  current: number;
  max: number;
}

export interface WeaponStatus {
  isReady: boolean;
  cooldownRemaining: number;
  shotsFired: number;
}

export class GameUI {
  private health: number;
  private maxHealth: number;
  private shotsFired: number;

  constructor(maxHealth: number = 100) {
    this.health = maxHealth;
    this.maxHealth = maxHealth;
    this.shotsFired = 0;
    this.createCrosshair();
  }

  public createCrosshair() {
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

  public updateHealthUI() {
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

  public updateWeaponHUD(weaponStatus: WeaponStatus) {
    const weaponStatusElement = document.getElementById('weapon-status');
    const shotsFiredElement = document.getElementById('shots-fired');
    
    if (weaponStatusElement) {
      if (!weaponStatus.isReady) {
        weaponStatusElement.textContent = `Reloading (${Math.ceil(weaponStatus.cooldownRemaining / 100) / 10}s)`;
        weaponStatusElement.style.color = '#FFC107';
      } else {
        weaponStatusElement.textContent = 'Ready';
        weaponStatusElement.style.color = '#4CAF50';
      }
    }
    
    if (shotsFiredElement) {
      shotsFiredElement.textContent = weaponStatus.shotsFired.toString();
    }
  }

  public takeDamage(damage: number): boolean {
    this.health = Math.max(0, this.health - damage);
    this.updateHealthUI();
    
    console.log(`💔 Took ${damage} damage! Health: ${this.health}/${this.maxHealth}`);
    
    this.showDamageEffect();
    
    if (this.health <= 0) {
      console.log('💀 Player died!');
      return true; // 사망
    }
    
    return false; // 생존
  }

  public showDamageEffect() {
    const overlay = document.createElement('div');
    overlay.className = 'damage-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 0, 0, 0.3);
      pointer-events: none;
      z-index: 9999;
      animation: damage-flash 0.3s ease-out;
    `;
    
    document.body.appendChild(overlay);
    
    overlay.addEventListener('animationend', () => {
      if (overlay.parentNode) {
        document.body.removeChild(overlay);
      }
    });
  }

  public respawn() {
    this.health = this.maxHealth;
    this.updateHealthUI();
    console.log('🔄 Respawned with full health');
  }

  public getHealth(): number {
    return this.health;
  }

  public getMaxHealth(): number {
    return this.maxHealth;
  }

  public isAlive(): boolean {
    return this.health > 0;
  }
} 
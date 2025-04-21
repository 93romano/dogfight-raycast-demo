import { FlightScene } from './components/FlightScene';

class Game {
  private flightScene: FlightScene;
  private speedElement: HTMLElement;
  private positionElement: HTMLElement;

  constructor() {
    const canvas = document.getElementById('webgl') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    this.speedElement = document.getElementById('speed') as HTMLElement;
    if (!this.speedElement) {
      throw new Error('Speed element not found');
    }

    this.positionElement = document.getElementById('position') as HTMLElement;
    if (!this.positionElement) {
      throw new Error('Position element not found');
    }

    this.flightScene = new FlightScene(canvas);
    this.animate();
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.flightScene.update();
    this.updateHUD();
  };

  private updateHUD = () => {
    this.speedElement.textContent = this.flightScene.getSpeed().toFixed(1);
    const pos = this.flightScene.getPosition();
    this.positionElement.textContent = `[${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}]`;
  };
}

// Initialize game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new Game();
}); 
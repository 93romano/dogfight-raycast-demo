import { MultiplayerScene } from './components/MultiplayerScene';

class Game {
  private multiplayerScene: MultiplayerScene;
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

    this.multiplayerScene = new MultiplayerScene(canvas);
    this.animate();
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.multiplayerScene.update();
    this.updateHUD();
  };

  private updateHUD = () => {
    this.speedElement.textContent = this.multiplayerScene.getSpeed().toFixed(1);
    const pos = this.multiplayerScene.getPosition();
    this.positionElement.textContent = `[${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}]`;
  };
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});

import { MultiplayerScene } from './components/MultiplayerScene';
import { GameHud } from './components/ui/GameHud';

class Game {
  private readonly hud: GameHud;
  private readonly multiplayerScene: MultiplayerScene;
  private animationFrameId: number | null = null;

  constructor() {
    const canvas = document.getElementById('webgl') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    this.hud = new GameHud();
    this.multiplayerScene = new MultiplayerScene(canvas, this.hud);

    window.addEventListener('beforeunload', this.dispose, { once: true });
    this.animate();
  }

  private animate = (): void => {
    this.animationFrameId = window.requestAnimationFrame(this.animate);
    this.multiplayerScene.update();

    const snapshot = this.multiplayerScene.getDebugSnapshot();
    this.hud.updateFrame(snapshot.speed, snapshot.position, snapshot.activeKeys);
  };

  private dispose = (): void => {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.multiplayerScene.dispose();
    this.hud.dispose();
  };
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});

import { MultiplayerScene } from './components/MultiplayerScene';

class Game {
  private multiplayerScene: MultiplayerScene;
  private speedElement: HTMLElement;
  private positionElement: HTMLElement;
  private eventsSentElement: HTMLElement;
  private lastEventElement: HTMLElement;
  private inputElements: { [key: string]: HTMLElement } = {};
  private eventsSent = 0;

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

    this.eventsSentElement = document.getElementById('events-sent') as HTMLElement;
    if (!this.eventsSentElement) {
      throw new Error('Events sent element not found');
    }

    this.lastEventElement = document.getElementById('last-event') as HTMLElement;
    if (!this.lastEventElement) {
      throw new Error('Last event element not found');
    }

    // 입력 상태 요소들 초기화
    const inputKeys = ['w', 's', 'a', 'd', 'up', 'down', 'left', 'right'];
    inputKeys.forEach(key => {
      const element = document.getElementById(`input-${key}`) as HTMLElement;
      if (element) {
        this.inputElements[key] = element;
      }
    });

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
    
    // 입력 상태 업데이트
    this.updateInputStatus();
    
    // 이벤트 정보 업데이트
    this.eventsSentElement.textContent = this.eventsSent.toString();
  };

  private updateInputStatus = () => {
    const keys = this.multiplayerScene.getActiveKeys();
    
    // 각 입력 키의 상태 업데이트
    if (keys.has('KeyW')) this.updateInputElement('w', true);
    else this.updateInputElement('w', false);
    
    if (keys.has('KeyS')) this.updateInputElement('s', true);
    else this.updateInputElement('s', false);
    
    if (keys.has('KeyA')) this.updateInputElement('a', true);
    else this.updateInputElement('a', false);
    
    if (keys.has('KeyD')) this.updateInputElement('d', true);
    else this.updateInputElement('d', false);
    
    if (keys.has('ArrowUp')) this.updateInputElement('up', true);
    else this.updateInputElement('up', false);
    
    if (keys.has('ArrowDown')) this.updateInputElement('down', true);
    else this.updateInputElement('down', false);
    
    if (keys.has('ArrowLeft')) this.updateInputElement('left', true);
    else this.updateInputElement('left', false);
    
    if (keys.has('ArrowRight')) this.updateInputElement('right', true);
    else this.updateInputElement('right', false);
  };

  private updateInputElement = (key: string, active: boolean) => {
    const element = this.inputElements[key];
    if (element) {
      element.className = `input-status ${active ? 'input-active' : 'input-inactive'}`;
    }
  };

  public onMovementEventSent = () => {
    this.eventsSent++;
    this.lastEventElement.textContent = new Date().toLocaleTimeString();
  };
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});

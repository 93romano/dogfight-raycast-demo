import { CameraController } from './CameraController';
import * as THREE from 'three';

export class CameraUI {
  private container: HTMLDivElement;
  private cameraController: CameraController;
  private positionDisplay: HTMLDivElement;
  private rotationDisplay: HTMLDivElement;

  constructor(cameraController: CameraController) {
    this.cameraController = cameraController;
    this.createUI();
  }

  private createUI() {
    this.container = document.createElement('div');
    this.container.id = 'camera-controls';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #333;
      border-radius: 8px;
      padding: 15px;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 1000;
      min-width: 250px;
      max-height: 80vh;
      overflow-y: auto;
    `;

    this.createTitle();
    this.createDisplays();
    this.createPositionControls();
    this.createLookAtControls();
    this.createQuaternionControls();
    this.createPresets();
    this.createModeToggles();
    this.createToggleButton();

    document.body.appendChild(this.container);
  }

  private createTitle() {
    const title = document.createElement('div');
    title.textContent = ' Camera Controls';
    title.style.cssText = `
      font-weight: bold;
      margin-bottom: 10px;
      color: #4CAF50;
    `;
    this.container.appendChild(title);
  }

  private createDisplays() {
    this.positionDisplay = document.createElement('div');
    this.positionDisplay.id = 'camera-position';
    this.positionDisplay.style.cssText = `
      margin-bottom: 10px;
      padding: 5px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    `;
    this.container.appendChild(this.positionDisplay);

    this.rotationDisplay = document.createElement('div');
    this.rotationDisplay.id = 'camera-rotation';
    this.rotationDisplay.style.cssText = `
      margin-bottom: 10px;
      padding: 5px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    `;
    this.container.appendChild(this.rotationDisplay);
  }

  private createPositionControls() {
    const separator = this.createSeparator();
    this.container.appendChild(separator);

    this.container.appendChild(this.createControl('X', 'x', 20, (axis, value) => {
      this.cameraController.setPosition(axis, value);
    }));
    this.container.appendChild(this.createControl('Y', 'y', 20, (axis, value) => {
      this.cameraController.setPosition(axis, value);
    }));
    this.container.appendChild(this.createControl('Z', 'z', 20, (axis, value) => {
      this.cameraController.setPosition(axis, value);
    }));
  }

  private createLookAtControls() {
    const separator = this.createSeparator();
    this.container.appendChild(separator);

    const lookAtTitle = document.createElement('div');
    lookAtTitle.textContent = ' LookAt Target';
    lookAtTitle.style.cssText = `
      font-weight: bold;
      margin-bottom: 8px;
      color: #FFC107;
    `;
    this.container.appendChild(lookAtTitle);

    this.container.appendChild(this.createControl('Target X', 'x', 0, (axis, value) => {
      this.cameraController.setLookAtTarget(axis, value);
    }));
    this.container.appendChild(this.createControl('Target Y', 'y', 0, (axis, value) => {
      this.cameraController.setLookAtTarget(axis, value);
    }));
    this.container.appendChild(this.createControl('Target Z', 'z', 0, (axis, value) => {
      this.cameraController.setLookAtTarget(axis, value);
    }));
  }

  private createQuaternionControls() {
    const separator = this.createSeparator();
    this.container.appendChild(separator);

    const quaternionTitle = document.createElement('div');
    quaternionTitle.textContent = ' Quaternion Control';
    quaternionTitle.style.cssText = `
      font-weight: bold;
      margin-bottom: 8px;
      color: #9C27B0;
    `;
    this.container.appendChild(quaternionTitle);

    this.container.appendChild(this.createControl('Rot X', 'x', 0, (axis, value) => {
      this.cameraController.setQuaternion(axis, value);
    }));
    this.container.appendChild(this.createControl('Rot Y', 'y', 0, (axis, value) => {
      this.cameraController.setQuaternion(axis, value);
    }));
    this.container.appendChild(this.createControl('Rot Z', 'z', 0, (axis, value) => {
      this.cameraController.setQuaternion(axis, value);
    }));
  }

  private createControl(label: string, axis: 'x' | 'y' | 'z', defaultValue: number, callback: (axis: 'x' | 'y' | 'z', value: number) => void) {
    const controlDiv = document.createElement('div');
    controlDiv.style.cssText = `
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const labelElement = document.createElement('label');
    labelElement.textContent = `${label}:`;
    labelElement.style.cssText = `
      min-width: 15px;
      font-size: 11px;
    `;

    const input = document.createElement('input');
    input.type = 'number';
    input.value = defaultValue.toString();
    input.step = '0.1';
    input.style.cssText = `
      width: 60px;
      padding: 2px 4px;
      border: 1px solid #555;
      border-radius: 3px;
      background: #333;
      color: white;
      font-size: 11px;
    `;

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      padding: 2px 6px;
      border: 1px solid #555;
      border-radius: 3px;
      background: #555;
      color: white;
      font-size: 10px;
      cursor: pointer;
    `;

    input.addEventListener('change', () => {
      const value = parseFloat(input.value);
      callback(axis, value);
    });

    resetBtn.addEventListener('click', () => {
      input.value = defaultValue.toString();
      callback(axis, defaultValue);
    });

    controlDiv.appendChild(labelElement);
    controlDiv.appendChild(input);
    controlDiv.appendChild(resetBtn);

    return controlDiv;
  }

  private createSeparator() {
    const separator = document.createElement('div');
    separator.style.cssText = `
      border-top: 1px solid #555;
      margin: 10px 0;
    `;
    return separator;
  }

  private createPresets() {
    // 위치 프리셋
    const presetsDiv = document.createElement('div');
    presetsDiv.style.cssText = `
      margin-top: 10px;
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    `;

    const presets = [
      { name: 'Top', x: 0, y: 50, z: 0 },
      { name: 'Side', x: 50, y: 0, z: 0 },
      { name: 'Front', x: 0, y: 0, z: 50 },
      { name: 'Default', x: 20, y: 20, z: 20 }
    ];

    presets.forEach(preset => {
      const btn = document.createElement('button');
      btn.textContent = preset.name;
      btn.style.cssText = `
        padding: 4px 8px;
        border: 1px solid #555;
        border-radius: 3px;
        background: #444;
        color: white;
        font-size: 10px;
        cursor: pointer;
      `;

      btn.addEventListener('click', () => {
        this.cameraController.setPosition('x', preset.x);
        this.cameraController.setPosition('y', preset.y);
        this.cameraController.setPosition('z', preset.z);
      });

      presetsDiv.appendChild(btn);
    });

    this.container.appendChild(presetsDiv);

    // LookAt 프리셋
    const lookAtPresetsDiv = document.createElement('div');
    lookAtPresetsDiv.style.cssText = `
      margin-top: 10px;
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    `;

    const lookAtPresets = [
      { name: 'Origin', x: 0, y: 0, z: 0 },
      { name: 'Plane', x: 0, y: 0, z: 0 },
      { name: 'Above', x: 0, y: 10, z: 0 },
      { name: 'Ahead', x: 0, y: 0, z: 10 }
    ];

    lookAtPresets.forEach(preset => {
      const btn = document.createElement('button');
      btn.textContent = preset.name;
      btn.style.cssText = `
        padding: 4px 8px;
        border: 1px solid #555;
        border-radius: 3px;
        background: #FFC107;
        color: black;
        font-size: 10px;
        cursor: pointer;
      `;

      btn.addEventListener('click', () => {
        this.cameraController.setLookAtTarget('x', preset.x);
        this.cameraController.setLookAtTarget('y', preset.y);
        this.cameraController.setLookAtTarget('z', preset.z);
      });

      lookAtPresetsDiv.appendChild(btn);
    });

    this.container.appendChild(lookAtPresetsDiv);
  }

  private createModeToggles() {
    // Follow 모드 토글
    const followToggleBtn = document.createElement('button');
    followToggleBtn.textContent = 'Follow: ON';
    followToggleBtn.style.cssText = `
      margin-top: 10px;
      width: 100%;
      padding: 6px;
      border: 1px solid #555;
      border-radius: 3px;
      background: #4CAF50;
      color: white;
      font-size: 11px;
      cursor: pointer;
    `;

    followToggleBtn.addEventListener('click', () => {
      const currentState = !this.cameraController.getState().followMode;
      this.cameraController.setFollowMode(currentState);
      followToggleBtn.textContent = currentState ? 'Follow: ON' : 'Follow: OFF';
      followToggleBtn.style.background = currentState ? '#4CAF50' : '#F44336';
    });

    this.container.appendChild(followToggleBtn);

    // LookAt 모드 토글
    const lookAtToggleBtn = document.createElement('button');
    lookAtToggleBtn.textContent = 'LookAt: ON';
    lookAtToggleBtn.style.cssText = `
      margin-top: 5px;
      width: 100%;
      padding: 6px;
      border: 1px solid #555;
      border-radius: 3px;
      background: #FFC107;
      color: black;
      font-size: 11px;
      cursor: pointer;
    `;

    lookAtToggleBtn.addEventListener('click', () => {
      const currentState = !this.cameraController.getState().lookAtMode;
      this.cameraController.setLookAtMode(currentState);
      lookAtToggleBtn.textContent = currentState ? 'LookAt: ON' : 'LookAt: OFF';
      lookAtToggleBtn.style.background = currentState ? '#FFC107' : '#F44336';
    });

    this.container.appendChild(lookAtToggleBtn);
  }

  private createToggleButton() {
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Hide';
    toggleBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      padding: 2px 6px;
      border: 1px solid #555;
      border-radius: 3px;
      background: #555;
      color: white;
      font-size: 10px;
      cursor: pointer;
    `;

    toggleBtn.addEventListener('click', () => {
      if (this.container.style.display === 'none') {
        this.container.style.display = 'block';
        toggleBtn.textContent = 'Hide';
      } else {
        this.container.style.display = 'none';
        toggleBtn.textContent = 'Show';
      }
    });

    this.container.appendChild(toggleBtn);
  }

  public updateDisplay(cameraState: CameraState) {
    if (this.positionDisplay) {
      this.positionDisplay.textContent = `Position: (${cameraState.position.x.toFixed(1)}, ${cameraState.position.y.toFixed(1)}, ${cameraState.position.z.toFixed(1)})`;
    }
    
    if (this.rotationDisplay) {
      const euler = new THREE.Euler().setFromQuaternion(cameraState.quaternion, 'YXZ');
      this.rotationDisplay.textContent = `Rotation: (${(euler.x * 180 / Math.PI).toFixed(1)}°, ${(euler.y * 180 / Math.PI).toFixed(1)}°, ${(euler.z * 180 / Math.PI).toFixed(1)}°)`;
    }
  }
} 
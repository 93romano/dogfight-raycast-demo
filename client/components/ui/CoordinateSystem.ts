import * as THREE from 'three';

export class CoordinateSystem {
  private scene: THREE.Scene;
  private gridSize: number;
  private gridDivisions: number;

  constructor(scene: THREE.Scene, gridSize: number = 10000, gridDivisions: number = 20) {
    this.scene = scene;
    this.gridSize = gridSize;
    this.gridDivisions = gridDivisions;
  }

  public initialize() {
    // 검은색 배경 설정
    this.scene.background = new THREE.Color(0x000000);
    
    this.createAxes();
    this.createGrids();
    this.addAxisLabels();
  }

  private createAxes() {
    // X축 (빨간색)
    const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-this.gridSize, 0, 0),
      new THREE.Vector3(this.gridSize, 0, 0)
    ]);
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    this.scene.add(xAxis);
    
    // Y축 (초록색)
    const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -this.gridSize, 0),
      new THREE.Vector3(0, this.gridSize, 0)
    ]);
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    this.scene.add(yAxis);
    
    // Z축 (파란색)
    const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -this.gridSize),
      new THREE.Vector3(0, 0, this.gridSize)
    ]);
    const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
    const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
    this.scene.add(zAxis);
  }

  private createGrids() {
    // XZ 평면 그리드 (흰색)
    const xzGrid = new THREE.GridHelper(this.gridSize * 2, this.gridDivisions, 0xffffff, 0x444444);
    xzGrid.position.y = 0;
    this.scene.add(xzGrid);
    
    // XY 평면 그리드 (회색)
    const xyGrid = new THREE.GridHelper(this.gridSize * 2, this.gridDivisions, 0x666666, 0x333333);
    xyGrid.rotation.x = Math.PI / 2;
    xyGrid.position.z = 0;
    this.scene.add(xyGrid);
    
    // YZ 평면 그리드 (회색)
    const yzGrid = new THREE.GridHelper(this.gridSize * 2, this.gridDivisions, 0x666666, 0x333333);
    yzGrid.rotation.z = Math.PI / 2;
    yzGrid.position.x = 0;
    this.scene.add(yzGrid);
  }

  private addAxisLabels() {
    const createLabel = (text: string, position: THREE.Vector3, color: number, scale: number = 5) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      
      canvas.width = 128;
      canvas.height = 64;
      
      context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      context.font = 'bold 24px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 64, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.scale.set(scale, scale * 0.5, 1);
      
      this.scene.add(sprite);
    };
    
    // 원점 라벨 추가
    createLabel('(0,0,0)', new THREE.Vector3(0, 0, 0), 0xffffff, 3);
    
    // 각 축의 끝에 라벨 추가
    createLabel('X', new THREE.Vector3(105, 0, 0), 0xff0000);
    createLabel('Y', new THREE.Vector3(0, 105, 0), 0x00ff00);
    createLabel('Z', new THREE.Vector3(0, 0, 105), 0x0000ff);
    
    // 그리드 간격마다 좌표 라벨 추가 (10 단위마다)
    for (let i = 10; i <= 100; i += 10) {
      // X축 라벨들
      createLabel(`(${i},0,0)`, new THREE.Vector3(i, 0, 0), 0x666666, 2);
      createLabel(`(-${i},0,0)`, new THREE.Vector3(-i, 0, 0), 0x666666, 2);
      
      // Y축 라벨들
      createLabel(`(0,${i},0)`, new THREE.Vector3(0, i, 0), 0x666666, 2);
      createLabel(`(0,-${i},0)`, new THREE.Vector3(0, -i, 0), 0x666666, 2);
      
      // Z축 라벨들
      createLabel(`(0,0,${i})`, new THREE.Vector3(0, 0, i), 0x666666, 2);
      createLabel(`(0,0,-${i})`, new THREE.Vector3(0, 0, -i), 0x666666, 2);
    }
  }
} 
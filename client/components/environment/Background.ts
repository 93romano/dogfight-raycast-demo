import * as THREE from 'three';

export class Background {
    private scene: THREE.Scene;
    private gridSize : number;
    private gridDivisions : number;

    constructor(scene: THREE.Scene, gridSize: number = 1000, gridDivisions: number = 10) {
        console.log('Background constructor- scene', scene);
        this.scene = scene;
        this.gridSize = gridSize;
        this.gridDivisions = gridDivisions;
    }

    public async initialize() {
     this.scene.background = new THREE.Color(0x000000);

     this.createAxes();
     this.createGrid();
    }

    private createAxes() {
        const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-this.gridSize, 0, 0), new THREE.Vector3(this.gridSize, 0, 0)
        ]);
        const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
        console.log('xAxis', xAxis);
        this.scene.add(xAxis);

        const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -this.gridSize, 0), new THREE.Vector3(0, this.gridSize, 0)
        ]);
        const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
        const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
        this.scene.add(yAxis);

        const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, -this.gridSize), new THREE.Vector3(0, 0, this.gridSize)
        ]);
        const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
        const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
        this.scene.add(zAxis);  
    }

    private createGrid() {
        const xzGrid = new THREE.GridHelper(this.gridSize, this.gridDivisions, 0x444444, 0x444444);
        xzGrid.position.y = 0;
        this.scene.add(xzGrid);

        const xyGrid = new THREE.GridHelper(this.gridSize, this.gridDivisions, 0x444444, 0x444444);
        xyGrid.position.z = 0;
        this.scene.add(xyGrid);

        const yzGrid = new THREE.GridHelper(this.gridSize, this.gridDivisions, 0x444444, 0x444444);
        yzGrid.position.x = 0;
        this.scene.add(yzGrid);
    }





}
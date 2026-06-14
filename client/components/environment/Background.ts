import * as THREE from 'three';

/**
 * In-game atmosphere for the "Modern Military HUD" art direction:
 *  - a gradient sky dome (deep navy zenith -> cyan-tinted horizon glow)
 *  - distance fog so the world melts into the horizon
 *  - a dark ground plane with a glowing cyan "tactical" grid baked into its
 *    emissive map (replaces the old RGB debug axes / gray grid)
 *  - a sprinkle of stars in the upper hemisphere
 */
export class Background {
  private readonly scene: THREE.Scene;
  private readonly worldSize: number;
  private readonly disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  private sky: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, worldSize = 4000) {
    this.scene = scene;
    this.worldSize = worldSize;
  }

  public async initialize(): Promise<void> {
    const horizon = new THREE.Color(0x0b2036);

    this.scene.background = new THREE.Color(0x05080f);
    this.scene.fog = new THREE.Fog(horizon.getHex(), 60, 1400);

    this.createSky();
    this.createGround();
    this.createStars();
  }

  private createSky(): void {
    const geometry = new THREE.SphereGeometry(this.worldSize, 32, 16);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x05080f) },
        horizonColor: { value: new THREE.Color(0x0c2238) },
        glowColor: { value: new THREE.Color(0x1f5a86) },
        exponent: { value: 0.8 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 glowColor;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float t = pow(max(h, 0.0), exponent);
          vec3 col = mix(horizonColor, topColor, t);
          float glow = smoothstep(0.0, 0.14, 0.14 - abs(h));
          col = mix(col, glowColor, glow * 0.55);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });

    this.sky = new THREE.Mesh(geometry, material);
    this.scene.add(this.sky);
    this.disposables.push(geometry, material);
  }

  private createGround(): void {
    const gridTexture = this.makeGridTexture();
    const repeats = Math.round(this.worldSize / 25); // ~25u cells
    gridTexture.repeat.set(repeats, repeats);

    const geometry = new THREE.PlaneGeometry(this.worldSize, this.worldSize);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0a1622,
      metalness: 0.25,
      roughness: 0.9,
      emissive: 0x3fa9ff,
      emissiveMap: gridTexture,
      emissiveIntensity: 0.85
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.disposables.push(geometry, material, gridTexture);
  }

  /** A single grid cell (bright cell borders on black) tiled across the ground. */
  private makeGridTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);
      // bright cell border + dim inner cross for a denser tactical feel
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  }

  private createStars(): void {
    const count = 1200;
    const positions = new Float32Array(count * 3);
    const radius = this.worldSize * 0.85;

    for (let i = 0; i < count; i++) {
      // deterministic upper-hemisphere distribution (no Math.random)
      const u = (i * 12.9898) % 1;
      const theta = (i * 2.399963) % (Math.PI * 2);
      const phi = Math.acos(0.15 + u * 0.85);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.abs(Math.cos(phi));
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x9fc4e8,
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.8,
      fog: false,
      depthWrite: false
    });

    const stars = new THREE.Points(geometry, material);
    this.scene.add(stars);
    this.disposables.push(geometry, material);
  }

  public dispose(): void {
    this.disposables.forEach((item) => item.dispose());
    this.disposables.length = 0;
  }
}

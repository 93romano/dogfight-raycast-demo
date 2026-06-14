import * as THREE from 'three';

/**
 * Procedural aircraft assets in the "Modern Military HUD" art direction
 * (dark navy metal, glowing cyan accents). Provides:
 *  - createStylizedJet(): a delta-wing fighter built from primitives, used as the
 *    fallback when Jet.glb fails to load (and as a preview model).
 *  - enableShadows(): make an arbitrary model (e.g. the GLB) cast/receive shadows.
 *
 * Convention: aircraft face -Z (matching FlightPhysics' forward vector).
 */

const COLORS = {
  body: 0x223047,
  bodyDark: 0x121b2a,
  accent: 0x3399ff,
  accentBright: 0x66ccff,
  glass: 0x66ccff
};

/** Flat delta surface in the XZ plane (span along X, chord along +Z = backward). */
function makeDelta(
  span: number,
  rootChord: number,
  tipChord: number,
  sweep: number,
  thickness: number,
  material: THREE.Material
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); // root leading edge
  shape.lineTo(0, rootChord); // root trailing edge
  shape.lineTo(span, sweep + tipChord); // tip trailing edge
  shape.lineTo(span, sweep); // tip leading edge
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateX(Math.PI / 2); // lay the shape flat (thickness -> Y)
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData.disposable = true;
  return mesh;
}

export function createStylizedJet(): THREE.Group {
  const jet = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: COLORS.body,
    metalness: 0.85,
    roughness: 0.42
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: COLORS.bodyDark,
    metalness: 0.9,
    roughness: 0.5
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: COLORS.bodyDark,
    emissive: COLORS.accent,
    emissiveIntensity: 1.1,
    metalness: 0.6,
    roughness: 0.3,
    side: THREE.DoubleSide
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: COLORS.body,
    metalness: 0.8,
    roughness: 0.45,
    side: THREE.DoubleSide
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: COLORS.glass,
    emissive: 0x113355,
    emissiveIntensity: 0.7,
    metalness: 0.95,
    roughness: 0.08,
    transparent: true,
    opacity: 0.85
  });

  // Fuselage (narrow nose toward -Z)
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.16, 2.6, 16), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  fuselage.userData.disposable = true;
  jet.add(fuselage);

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 16), darkMat);
  nose.rotation.x = -Math.PI / 2; // apex -> -Z
  nose.position.z = -1.7;
  nose.castShadow = true;
  nose.userData.disposable = true;
  jet.add(nose);

  // Delta wings (mirrored pair, roots on the fuselage centerline)
  const rightWing = makeDelta(1.85, 1.15, 0.25, 0.7, 0.05, wingMat);
  rightWing.position.set(0, -0.04, -0.2);
  jet.add(rightWing);
  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  jet.add(leftWing);

  // Glowing cyan leading-edge accents
  const rightEdge = makeDelta(1.85, 0.12, 0.06, 0.7, 0.06, accentMat);
  rightEdge.position.set(0, 0.01, -0.2);
  jet.add(rightEdge);
  const leftEdge = rightEdge.clone();
  leftEdge.scale.x = -1;
  jet.add(leftEdge);

  // Centered vertical tail fin
  const fin = makeDelta(0.55, 0.7, 0.2, 0.35, 0.06, wingMat);
  fin.rotation.z = Math.PI / 2;
  fin.position.set(0, 0.12, 0.55);
  jet.add(fin);

  // Horizontal stabilizers at the tail (mirrored pair)
  const rightStab = makeDelta(0.6, 0.45, 0.12, 0.25, 0.04, wingMat);
  rightStab.position.set(0, 0, 0.95);
  jet.add(rightStab);
  const leftStab = rightStab.clone();
  leftStab.scale.x = -1;
  jet.add(leftStab);

  // Cockpit canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glassMat);
  canopy.scale.set(1, 0.7, 2.3);
  canopy.position.set(0, 0.16, -0.5);
  canopy.castShadow = true;
  canopy.userData.disposable = true;
  jet.add(canopy);

  // Engine nozzle
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.35, 16), darkMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = 1.45;
  nozzle.castShadow = true;
  nozzle.userData.disposable = true;
  jet.add(nozzle);

  jet.userData.isProceduralJet = true;
  return jet;
}

/** Make every mesh in a model cast and receive shadows (used for the GLB jet). */
export function enableShadows(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

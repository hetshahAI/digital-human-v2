import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function setupControls(camera: THREE.PerspectiveCamera, domElement: HTMLElement): OrbitControls {
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5; // Allows crystal-clear close-up zoom on face and details
    controls.maxDistance = 10.0; // Allows wide zoom out on full Dubai reception lobby
    controls.maxPolarAngle = Math.PI / 2 + 0.02; // Don't flip below floor
    controls.target.set(0, 1.20, 0.7); // Focus on natural conversation eye level
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 1.1;
    return controls;
}


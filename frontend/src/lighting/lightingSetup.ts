import * as THREE from 'three';

export interface LightingRig {
    keyLight: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
    ambientLight: THREE.AmbientLight;
    hemisphereLight: THREE.HemisphereLight;
    coveLights: THREE.PointLight[];
}

export function setupLighting(scene: THREE.Scene): LightingRig {
    // 1. Soft Warm Ambient Illumination (Warm Sunset Baseline)
    const ambientLight = new THREE.AmbientLight(0xfff1e6, 0.45);
    scene.add(ambientLight);

    // 2. KEY LIGHT: Warm Dubai Golden Sunset Directional Light
    // High-angle golden hour sunlight casting soft, flattering facial contours
    const keyLight = new THREE.DirectionalLight(0xffeed6, 1.85);
    keyLight.position.set(2.2, 3.2, 2.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.2;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 3.0;
    keyLight.shadow.camera.bottom = -1.5;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.radius = 3.5; // Ultra-soft shadow penumbra
    scene.add(keyLight);

    // 3. FILL LIGHT: Soft Diffuse Architectural White Fill
    // Balances high-contrast shadows without flattening facial depth
    const fillLight = new THREE.DirectionalLight(0xf8fafc, 0.75);
    fillLight.position.set(-2.6, 2.0, 1.8);
    scene.add(fillLight);

    // 4. RIM LIGHT: Crisp Cool Blue Sky Silhouette Light
    // Placed behind avatar to create separation from the background glass curtain
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.45);
    rimLight.position.set(-0.5, 2.8, -3.2);
    scene.add(rimLight);

    // 5. HEMISPHERE LIGHT: Warm Sunset Horizon & Deep Navy Floor Bounce
    const hemisphereLight = new THREE.HemisphereLight(0xfde68a, 0x0f172a, 0.55);
    hemisphereLight.position.set(0, 6, 0);
    scene.add(hemisphereLight);

    // 6. ARCHITECTURAL COVE LIGHTS: Recessed ceiling downlights for luxury lobby atmosphere
    const coveLights: THREE.PointLight[] = [];
    
    // Warm downlight above reception area
    const downlight1 = new THREE.PointLight(0xfef3c7, 1.2, 8, 1.8);
    downlight1.position.set(0, 3.6, 0.8);
    scene.add(downlight1);
    coveLights.push(downlight1);

    // Subtle golden glow near mashrabiya accent wall
    const downlight2 = new THREE.PointLight(0xf59e0b, 1.0, 6, 1.5);
    downlight2.position.set(2.8, 2.5, -1.5);
    scene.add(downlight2);
    coveLights.push(downlight2);

    return {
        keyLight,
        fillLight,
        rimLight,
        ambientLight,
        hemisphereLight,
        coveLights
    };
}


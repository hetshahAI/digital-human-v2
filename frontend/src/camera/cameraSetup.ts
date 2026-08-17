import * as THREE from 'three';

export type ConversationCameraState = 'IDLE' | 'SPEAKING' | 'LISTENING';

export class CinematicCameraEngine {
    public camera: THREE.PerspectiveCamera;
    public basePosition: THREE.Vector3;
    public baseTarget: THREE.Vector3;
    
    private currentPosition: THREE.Vector3;
    private currentTarget: THREE.Vector3;
    private targetDollyOffset: THREE.Vector3;
    private currentDollyOffset: THREE.Vector3;

    private mouseOffset = { x: 0, y: 0 };
    private targetMouseOffset = { x: 0, y: 0 };
    private elapsedTime = 0;
    public state: ConversationCameraState = 'IDLE';
    public userInteracting = false;

    constructor() {
        const aspect = window.innerWidth / window.innerHeight;
        // 34° FOV gives natural telephoto portrait compression, framing Alicia at 35-45% screen height
        this.camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 100);
        
        // Target composition: Desk in lower third, Alicia prominent in center, Burj Khalifa in background
        this.basePosition = new THREE.Vector3(-0.85, 1.30, 1.45);
        this.baseTarget = new THREE.Vector3(-0.85, 1.15, -0.95);

        this.currentPosition = this.basePosition.clone();
        this.currentTarget = this.baseTarget.clone();
        this.targetDollyOffset = new THREE.Vector3(0, 0, 0);
        this.currentDollyOffset = new THREE.Vector3(0, 0, 0);

        this.camera.position.copy(this.basePosition);
        this.camera.lookAt(this.baseTarget);

        window.addEventListener('mousemove', (e) => {
            if (this.userInteracting) return;
            const normX = (e.clientX / window.innerWidth - 0.5) * 2;
            const normY = (e.clientY / window.innerHeight - 0.5) * 2;
            this.targetMouseOffset.x = normX * 0.035;
            this.targetMouseOffset.y = -normY * 0.025;
        });
    }

    public setState(state: ConversationCameraState) {
        this.state = state;
        if (state === 'SPEAKING') {
            // Smoothly dolly in toward Alicia during speech
            this.targetDollyOffset.set(0.05, 0.02, -0.22);
        } else if (state === 'LISTENING') {
            // Slight dolly back when user speaks
            this.targetDollyOffset.set(-0.02, -0.01, 0.10);
        } else {
            // Return to default executive framing
            this.targetDollyOffset.set(0, 0, 0);
        }
    }

    public resetView() {
        this.userInteracting = false;
        this.currentPosition.copy(this.basePosition);
        this.currentTarget.copy(this.baseTarget);
        this.targetDollyOffset.set(0, 0, 0);
        this.currentDollyOffset.set(0, 0, 0);
        this.camera.position.copy(this.basePosition);
        this.camera.lookAt(this.baseTarget);
    }

    public update(delta: number, controls?: any) {
        this.elapsedTime += delta;

        // If user is actively manipulating OrbitControls, let controls have full authority
        if (controls && controls.state !== -1) {
            this.userInteracting = true;
            return;
        }

        // Smoothly interpolate dolly offset
        this.currentDollyOffset.lerp(this.targetDollyOffset, delta * 2.2);

        // Smooth mouse parallax
        this.mouseOffset.x += (this.targetMouseOffset.x - this.mouseOffset.x) * delta * 3.0;
        this.mouseOffset.y += (this.targetMouseOffset.y - this.mouseOffset.y) * delta * 3.0;

        // Multi-frequency organic Lissajous micro-breathing drift
        const t = this.elapsedTime;
        const driftX = Math.sin(t * 0.32) * 0.006 + Math.cos(t * 0.58) * 0.002;
        const driftY = Math.sin(t * 0.42) * 0.004 + Math.cos(t * 0.22) * 0.002;
        const driftZ = Math.sin(t * 0.28) * 0.003;

        if (!this.userInteracting) {
            this.camera.position.x = this.basePosition.x + this.currentDollyOffset.x + this.mouseOffset.x + driftX;
            this.camera.position.y = this.basePosition.y + this.currentDollyOffset.y + this.mouseOffset.y + driftY;
            this.camera.position.z = this.basePosition.z + this.currentDollyOffset.z + driftZ;

            if (controls) {
                controls.target.copy(this.baseTarget);
            } else {
                this.camera.lookAt(this.baseTarget);
            }
        }
    }
}

export function setupCamera(): THREE.PerspectiveCamera {
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 100);
    // Positioned so Alicia occupies 35-45% of screen height at her executive desk
    camera.position.set(-0.85, 1.30, 1.45);
    return camera;
}

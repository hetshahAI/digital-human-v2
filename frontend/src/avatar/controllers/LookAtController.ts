import * as THREE from 'three';
import type { AnimationFrame } from '../animation/AnimationFrame';
import { CharacterState } from '../../character/CharacterState';

export class LookAtController {
    private mouse: THREE.Vector2;
    private windowHalf: THREE.Vector2;
    private currentTargetPos: THREE.Vector3;
    private currentState: CharacterState = CharacterState.WORKING;
    private gazeTimer: number = 0;
    private saccadeOffset: THREE.Vector3 = new THREE.Vector3();
    private saccadeTimer: number = 0;
    
    constructor() {
        this.mouse = new THREE.Vector2(0, 0);
        this.windowHalf = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
        this.currentTargetPos = new THREE.Vector3(0, 1.35, 2.5);
        
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('resize', this.onResize.bind(this));
    }

    public setState(state: CharacterState): void {
        this.currentState = state;
    }

    private onMouseMove(event: MouseEvent) {
        this.mouse.x = (event.clientX - this.windowHalf.x) / this.windowHalf.x;
        this.mouse.y = -(event.clientY - this.windowHalf.y) / this.windowHalf.y;
    }
    
    private onResize() {
        this.windowHalf.set(window.innerWidth / 2, window.innerHeight / 2);
    }

    public update(delta: number): AnimationFrame {
        this.gazeTimer += delta;
        this.saccadeTimer += delta;

        // Subtle ocular micro-saccades every 1.5 - 3.5 seconds
        if (this.saccadeTimer > 2.2) {
            this.saccadeTimer = 0;
            this.saccadeOffset.set(
                (Math.random() - 0.5) * 0.08,
                (Math.random() - 0.5) * 0.06,
                0
            );
        }

        let idealPos = new THREE.Vector3();

        if (this.currentState === CharacterState.THINKING) {
            // Cognitive gaze aversion: eyes drift up and to the side thoughtfully
            const thinkDriftX = Math.sin(this.gazeTimer * 1.2) * 0.25 - 0.4;
            const thinkDriftY = 1.7 + Math.cos(this.gazeTimer * 0.8) * 0.15;
            idealPos.set(thinkDriftX, thinkDriftY, 1.8);
        } else if (
            this.currentState === CharacterState.LISTENING ||
            this.currentState === CharacterState.SPEAKING ||
            this.currentState === CharacterState.INTRODUCING ||
            this.currentState === CharacterState.ARRIVING ||
            this.currentState === CharacterState.NOTICE_USER
        ) {
            // Direct conversational contact with user / camera plus slight interactive mouse tracking
            const userX = -this.mouse.x * 0.6 + this.saccadeOffset.x;
            const userY = 1.35 + this.mouse.y * 0.4 + this.saccadeOffset.y;
            const userZ = 2.5;
            idealPos.set(userX, userY, userZ);
        } else {
            // Working / Idle state: relaxed gaze looking around workspace/environment
            const ambientX = -1.8 + Math.sin(this.gazeTimer * 0.3) * 0.5;
            const ambientY = 0.9 + Math.cos(this.gazeTimer * 0.25) * 0.2;
            const ambientZ = -1.0;
            idealPos.set(ambientX, ambientY, ambientZ);
        }

        // Smooth interpolation
        this.currentTargetPos.lerp(idealPos, this.currentState === CharacterState.THINKING || this.saccadeTimer > 0.1 ? 12.0 * delta : 4.0 * delta);
        
        return {
            timestamp: performance.now(),
            expressions: {},
            lookAt: { x: this.currentTargetPos.x, y: this.currentTargetPos.y, z: this.currentTargetPos.z }
        };
    }
}


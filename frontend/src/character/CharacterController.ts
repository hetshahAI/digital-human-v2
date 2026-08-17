import * as THREE from 'three';
import { AvatarController } from '../avatar/controllers/AvatarController';
import { CharacterState } from './CharacterState';
import { CharacterStateMachine } from './CharacterStateMachine';
import { CharacterConfig } from './CharacterConfig';
import { NavigationController } from './NavigationController';
import { MovementController } from './MovementController';
import { IdleBehaviorController } from './IdleBehaviorController';

export class CharacterController {
    public avatarController: AvatarController;
    public stateMachine: CharacterStateMachine;
    public navigation: NavigationController;
    public movement: MovementController;
    public idleBehavior: IdleBehaviorController;
    public camera: THREE.PerspectiveCamera | null = null;

    private noticeTimer: number = 0;
    private arrivalTimer: number = 0;
    private goodbyeTimer: number = 0;

    constructor(avatarController: AvatarController) {
        this.avatarController = avatarController;
        this.stateMachine = new CharacterStateMachine(CharacterState.WORKING);
        this.navigation = new NavigationController();
        this.movement = new MovementController(this.navigation);
        this.idleBehavior = new IdleBehaviorController();
    }

    public setCamera(camera: THREE.PerspectiveCamera): void {
        this.camera = camera;
    }

    public initPosition(): void {
        const home = CharacterConfig.positions.HOME;
        this.movement.setVRM(this.avatarController.vrm);
        this.idleBehavior.setVRM(this.avatarController.vrm);
        this.movement.teleportTo(home.x, home.y, home.z, home.rotationY);
        this.stateMachine.setState(CharacterState.WORKING);
    }

    public getPosition(): THREE.Vector3 {
        if (this.avatarController.vrm) {
            return this.avatarController.vrm.scene.position;
        }
        return new THREE.Vector3(0, 0, 0);
    }

    /**
     * User clicks "Talk to Alicia"
     */
    public callToUser(): boolean {
        const state = this.stateMachine.getState();
        // Prevent duplicate calls if already in conversation flow
        if (
            state === CharacterState.NOTICE_USER ||
            state === CharacterState.WALKING_TO_USER ||
            state === CharacterState.ARRIVING ||
            state === CharacterState.FACE_USER ||
            state === CharacterState.INTRODUCING ||
            state === CharacterState.LISTENING ||
            state === CharacterState.THINKING ||
            state === CharacterState.SPEAKING
        ) {
            return false;
        }

        this.noticeTimer = 0;
        this.stateMachine.setState(CharacterState.NOTICE_USER);
        return true;
    }

    /**
     * User clicks "End Conversation"
     */
    public dismissToHome(): boolean {
        const state = this.stateMachine.getState();
        if (
            state === CharacterState.GOODBYE ||
            state === CharacterState.WALKING_BACK ||
            state === CharacterState.RETURNING_TO_WORK ||
            state === CharacterState.WORKING
        ) {
            return false;
        }

        this.goodbyeTimer = 0;
        this.stateMachine.setState(CharacterState.GOODBYE);
        return true;
    }

    /**
     * Called when goodbye speech finishes playing
     */
    public startWalkingBack(): void {
        const state = this.stateMachine.getState();
        if (
            state === CharacterState.WALKING_BACK ||
            state === CharacterState.RETURNING_TO_WORK ||
            state === CharacterState.WORKING
        ) {
            return;
        }

        this.navigation.setDestination(CharacterConfig.positions.HOME);
        this.stateMachine.setState(CharacterState.WALKING_BACK);
    }

    public getState(): CharacterState {
        return this.stateMachine.getState();
    }

    public update(delta: number): void {
        const state = this.stateMachine.getState();
        this.stateMachine.update(delta);
        this.avatarController.setCharacterState(state);

        // State Machine Logic
        switch (state) {
            case CharacterState.WORKING:
            case CharacterState.IDLE:
                // Idle breathing and ambient behavior at home position
                break;

            case CharacterState.NOTICE_USER:
                this.noticeTimer += delta;
                if (this.noticeTimer >= CharacterConfig.timings.noticeDuration) {
                    // Start walking to conversation position
                    this.navigation.setDestination(CharacterConfig.positions.CONVERSATION);
                    this.stateMachine.setState(CharacterState.WALKING_TO_USER);
                }
                break;

            case CharacterState.WALKING_TO_USER: {
                const arrived = this.movement.update(delta);
                if (arrived) {
                    this.arrivalTimer = 0;
                    this.stateMachine.setState(CharacterState.ARRIVING);
                }
                break;
            }

            case CharacterState.ARRIVING:
                this.arrivalTimer += delta;
                if (this.arrivalTimer >= CharacterConfig.timings.arrivalPause) {
                    this.stateMachine.setState(CharacterState.FACE_USER);
                }
                break;

            case CharacterState.FACE_USER: {
                // Rotate smoothly to face the camera/user
                const currentPos = this.movement.getPosition();
                const camX = this.camera ? this.camera.position.x : 0;
                const camZ = this.camera ? this.camera.position.z : 2.5;
                const targetYaw = Math.atan2(camX - currentPos.x, camZ - currentPos.z);
                
                const aligned = this.movement.rotateTowards(targetYaw, delta);
                if (aligned) {
                    this.stateMachine.setState(CharacterState.INTRODUCING);
                }
                break;
            }

            case CharacterState.INTRODUCING:
            case CharacterState.LISTENING:
            case CharacterState.THINKING:
            case CharacterState.SPEAKING:
                // Keep body naturally facing camera while interacting
                if (this.camera) {
                    const currentPos = this.movement.getPosition();
                    const targetYaw = Math.atan2(this.camera.position.x - currentPos.x, this.camera.position.z - currentPos.z);
                    this.movement.rotateTowards(targetYaw, delta, 0.5); // Gentle orientation tracking
                }
                break;

            case CharacterState.GOODBYE:
                // Face camera while delivering goodbye speech; fallback safety timeout
                if (this.camera) {
                    const currentPos = this.movement.getPosition();
                    const targetYaw = Math.atan2(this.camera.position.x - currentPos.x, this.camera.position.z - currentPos.z);
                    this.movement.rotateTowards(targetYaw, delta, 0.5);
                }
                this.goodbyeTimer += delta;
                if (this.goodbyeTimer >= 4.0) {
                    // Safety timeout if audio completion event was lost
                    this.startWalkingBack();
                }
                break;


            case CharacterState.WALKING_BACK: {
                const arrivedHome = this.movement.update(delta);
                if (arrivedHome) {
                    this.stateMachine.setState(CharacterState.RETURNING_TO_WORK);
                }
                break;
            }

            case CharacterState.RETURNING_TO_WORK: {
                // Rotate back to face desk
                const alignedDesk = this.movement.rotateTowards(CharacterConfig.positions.HOME.rotationY || Math.PI, delta);
                if (alignedDesk) {
                    this.stateMachine.setState(CharacterState.WORKING);
                }
                break;
            }
        }

        // Apply idle behaviors (breathing, posture adjustments)
        this.idleBehavior.update(delta, state, this.movement.isWalking());
    }
}

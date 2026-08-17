import type { VRM } from '@pixiv/three-vrm';
import { CharacterConfig } from './CharacterConfig';
import { CharacterState } from './CharacterState';

export class IdleBehaviorController {
    private vrm: VRM | null = null;
    private idleTime: number = 0;
    private postureShiftTime: number = 0;
    private currentPostureSway: number = 0;
    private targetPostureSway: number = 0;

    public setVRM(vrm: VRM | null): void {
        this.vrm = vrm;
    }

    public update(delta: number, state: CharacterState, isMoving: boolean): void {
        if (!this.vrm || isMoving || !this.vrm.humanoid) return;

        this.idleTime += delta;
        this.postureShiftTime += delta;

        // Biological posture shift every 7-12 seconds
        if (this.postureShiftTime > 8.5) {
            this.postureShiftTime = (Math.random() - 0.5) * 3.0;
            this.targetPostureSway = (Math.random() - 0.5) * 0.04;
        }
        this.currentPostureSway += (this.targetPostureSway - this.currentPostureSway) * delta * 1.5;

        // 1. Multi-Harmonic Biological Respiration
        const primaryBreath = Math.sin(this.idleTime * CharacterConfig.idle.breathingFrequency);
        const secondaryBreath = Math.sin(this.idleTime * (CharacterConfig.idle.breathingFrequency * 2.1)) * 0.15;
        const breathCycle = primaryBreath + secondaryBreath;

        const spine = this.vrm.humanoid.getNormalizedBoneNode('spine');
        const chest = this.vrm.humanoid.getNormalizedBoneNode('chest');
        const upperChest = this.vrm.humanoid.getNormalizedBoneNode('upperChest');
        const neck = this.vrm.humanoid.getNormalizedBoneNode('neck');
        const head = this.vrm.humanoid.getNormalizedBoneNode('head');
        const leftShoulder = this.vrm.humanoid.getNormalizedBoneNode('leftShoulder');
        const rightShoulder = this.vrm.humanoid.getNormalizedBoneNode('rightShoulder');
        const hips = this.vrm.humanoid.getNormalizedBoneNode('hips');

        // Respiration through spine and ribcage
        if (spine) {
            spine.rotation.x = breathCycle * CharacterConfig.idle.breathingAmplitude;
            spine.rotation.z = this.currentPostureSway * 0.4;
        }

        if (chest) {
            chest.rotation.x = breathCycle * (CharacterConfig.idle.breathingAmplitude * 0.85);
            chest.rotation.y = this.currentPostureSway * 0.3;
        }

        if (upperChest) {
            upperChest.rotation.x = breathCycle * (CharacterConfig.idle.breathingAmplitude * 0.45);
        }

        // Clavicle / shoulder rise and fall during breathing
        if (leftShoulder && rightShoulder) {
            const shoulderRise = breathCycle * 0.008;
            leftShoulder.rotation.z = shoulderRise;
            rightShoulder.rotation.z = -shoulderRise;
        }

        // Subtle hip weight balance
        if (hips) {
            hips.rotation.z = -this.currentPostureSway * 0.5;
        }

        // 2. Natural Executive Arm & Hand Posture (No T-Pose)
        const leftUpperArm = this.vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightUpperArm = this.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
        const leftLowerArm = this.vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
        const rightLowerArm = this.vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
        const leftHand = this.vrm.humanoid.getNormalizedBoneNode('leftHand');
        const rightHand = this.vrm.humanoid.getNormalizedBoneNode('rightHand');

        // Base executive resting posture: arms lowered gracefully beside the torso with subtle elbow bend
        let targetLeftArmZ = -1.34;
        let targetRightArmZ = 1.34;
        let targetLeftArmX = 0.16;
        let targetRightArmX = 0.16;
        let targetLeftForearmX = 0.36;
        let targetRightForearmX = 0.36;

        // 3. State-Specific Refined Executive Posture & Body Language
        if (state === CharacterState.LISTENING) {
            // Attentive Receptionist: gentle 3-4° head tilt, open welcoming executive stance
            if (head) {
                const microNod = Math.sin(this.idleTime * 0.8) * 0.015;
                head.rotation.z = -0.045; // Subtle attentive head tilt
                head.rotation.x = -0.02 + microNod; // Slight forward chin elevation
                head.rotation.y = Math.sin(this.idleTime * 0.4) * 0.025;
            }
            if (neck) {
                neck.rotation.z = -0.02;
            }
            // Relaxed executive posture
            targetLeftArmZ = -1.30;
            targetRightArmZ = 1.30;
            targetLeftArmX = 0.18;
            targetRightArmX = 0.18;
            targetLeftForearmX = 0.42;
            targetRightForearmX = 0.42;
        } else if (state === CharacterState.SPEAKING || state === CharacterState.INTRODUCING) {
            // Conversational Executive: natural subtle cadence micro-nods and subtle open hand gestures
            if (head) {
                const speechNod = Math.sin(this.idleTime * 2.8) * 0.022 + Math.cos(this.idleTime * 1.4) * 0.012;
                const speechTurn = Math.sin(this.idleTime * 1.1) * 0.035;
                head.rotation.x = speechNod;
                head.rotation.y = speechTurn;
                head.rotation.z = Math.sin(this.idleTime * 0.9) * 0.018;
            }
            // Subtle conversational arm expression
            const gesture = Math.sin(this.idleTime * 1.8) * 0.06;
            targetLeftArmZ = -1.26 - gesture * 0.4;
            targetRightArmZ = 1.26 + gesture * 0.4;
            targetLeftArmX = 0.24 + gesture;
            targetRightArmX = 0.24 - gesture;
            targetLeftForearmX = 0.48 + gesture;
            targetRightForearmX = 0.48 - gesture;
        } else if (state === CharacterState.THINKING) {
            // Thoughtful processing: head slightly tilted up and to the right
            if (head) {
                head.rotation.x = -0.06;
                head.rotation.y = 0.05 + Math.sin(this.idleTime * 0.6) * 0.02;
                head.rotation.z = 0.03;
            }
            targetLeftArmZ = -1.22;
            targetRightArmZ = 1.30;
            targetLeftArmX = 0.28;
            targetLeftForearmX = 0.55;
        } else if (state === CharacterState.WORKING || state === CharacterState.RETURNING_TO_WORK) {
            // Working posture: slightly tilted forward inspecting executive reception console
            if (head) {
                const workNod = Math.sin(this.idleTime * 0.5) * 0.02;
                head.rotation.x = 0.14 + workNod;
                head.rotation.y = Math.sin(this.idleTime * 0.3) * 0.04;
                head.rotation.z = 0;
            }
            targetLeftArmZ = -1.28;
            targetRightArmZ = 1.28;
            targetLeftArmX = 0.34;
            targetRightArmX = 0.34;
            targetLeftForearmX = 0.58;
            targetRightForearmX = 0.58;
        } else if (state === CharacterState.NOTICE_USER) {
            // Alert / welcoming posture: upright, turning warmly toward visitor
            if (head) {
                head.rotation.x = -0.04;
                head.rotation.y = Math.sin(this.idleTime * 2.0) * 0.03;
                head.rotation.z = -0.02;
            }
            targetLeftArmZ = -1.32;
            targetRightArmZ = 1.32;
            targetLeftArmX = 0.16;
            targetRightArmX = 0.16;
        } else {
            // General Idle: natural organic head wander
            if (head) {
                const drift = Math.sin(this.idleTime * CharacterConfig.idle.headDriftFrequency);
                head.rotation.y = drift * CharacterConfig.idle.headDriftAmplitude;
                head.rotation.z = Math.sin(this.idleTime * 0.3) * 0.015;
            }
        }

        // Apply arm and forearm rotations
        if (leftUpperArm) {
            leftUpperArm.rotation.z = targetLeftArmZ;
            leftUpperArm.rotation.x = targetLeftArmX;
            leftUpperArm.rotation.y = 0.08;
        }
        if (rightUpperArm) {
            rightUpperArm.rotation.z = targetRightArmZ;
            rightUpperArm.rotation.x = targetRightArmX;
            rightUpperArm.rotation.y = -0.08;
        }
        if (leftLowerArm) {
            leftLowerArm.rotation.x = targetLeftForearmX;
            leftLowerArm.rotation.y = 0.18;
        }
        if (rightLowerArm) {
            rightLowerArm.rotation.x = targetRightForearmX;
            rightLowerArm.rotation.y = -0.18;
        }
        if (leftHand) {
            leftHand.rotation.x = 0.08;
            leftHand.rotation.z = -0.08;
            leftHand.rotation.y = 0.12;
        }
        if (rightHand) {
            rightHand.rotation.x = 0.08;
            rightHand.rotation.z = 0.08;
            rightHand.rotation.y = -0.12;
        }
    }
}

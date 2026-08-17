import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { CharacterConfig } from './CharacterConfig';
import { NavigationController } from './NavigationController';

export class MovementController {
    private vrm: VRM | null = null;
    private walkTime: number = 0;
    private isMoving: boolean = false;
    private currentSpeed: number = 0;
    private nav: NavigationController;

    constructor(nav: NavigationController) {
        this.nav = nav;
    }

    public setVRM(vrm: VRM | null): void {
        this.vrm = vrm;
    }

    public teleportTo(x: number, y: number, z: number, rotationY?: number): void {
        if (!this.vrm) return;
        this.vrm.scene.position.set(x, y, z);
        if (rotationY !== undefined) {
            this.vrm.scene.rotation.y = rotationY;
        }
        this.isMoving = false;
        this.currentSpeed = 0;
        this.walkTime = 0;
    }

    public getPosition(): THREE.Vector3 {
        return this.vrm ? this.vrm.scene.position : new THREE.Vector3();
    }

    public getRotationY(): number {
        return this.vrm ? this.vrm.scene.rotation.y : 0;
    }

    public isWalking(): boolean {
        return this.isMoving;
    }

    /**
     * Smoothly rotates avatar towards a specific yaw angle
     */
    public rotateTowards(targetAngle: number, delta: number, speedMultiplier: number = 1.0): boolean {
        if (!this.vrm) return true;

        const currentY = this.vrm.scene.rotation.y;
        let diff = targetAngle - currentY;

        // Normalize difference to [-PI, PI] for shortest path
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const step = CharacterConfig.movement.rotationSpeed * speedMultiplier * delta;

        if (Math.abs(diff) <= step) {
            this.vrm.scene.rotation.y = targetAngle;
        } else {
            this.vrm.scene.rotation.y += Math.sign(diff) * step;
        }

        // Return true if we're closely aligned
        return Math.abs(diff) <= CharacterConfig.movement.angleThreshold;
    }

    /**
     * Updates movement towards navigation destination.
     * Returns true if arrived at destination.
     */
    public update(delta: number): boolean {
        if (!this.vrm || !this.nav.isNavigating()) {
            this.isMoving = false;
            return true;
        }

        const currentPos = this.vrm.scene.position;
        const distance = this.nav.getDistanceToTarget(currentPos);

        if (distance <= CharacterConfig.movement.arrivalThreshold) {
            // Target position reached - now rotate to final desired orientation
            const targetRotY = this.nav.getTargetRotationY();
            const angleAligned = this.rotateTowards(targetRotY, delta);

            this.isMoving = false;
            this.currentSpeed = 0;
            return angleAligned;
        }

        // We are moving towards target
        this.isMoving = true;
        this.walkTime += delta;

        // 1. Calculate direction vector
        const dir = this.nav.getDirectionToTarget(currentPos);
        const headingAngle = this.nav.getHeadingAngle(dir);

        // 2. Smoothly rotate towards heading direction
        this.rotateTowards(headingAngle, delta, 1.2);

        // 3. Accelerate / translate towards target
        const targetSpeed = CharacterConfig.movement.walkSpeed;
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetSpeed, 10.0 * delta);

        const step = Math.min(distance, this.currentSpeed * delta);
        currentPos.x += dir.x * step;
        currentPos.z += dir.z * step;

        // 4. Subtle procedural walk bobbing & arm sway
        const bob = Math.sin(this.walkTime * CharacterConfig.movement.bobbingFrequency) * CharacterConfig.movement.bobbingAmplitude;
        currentPos.y = Math.max(0, bob);

        // Subtle leg / arm bone simulation if humanoid bones exist
        if (this.vrm.humanoid) {
            const sway = Math.cos(this.walkTime * CharacterConfig.movement.bobbingFrequency * 0.5);
            const spine = this.vrm.humanoid.getNormalizedBoneNode('spine');
            if (spine) {
                spine.rotation.z = sway * CharacterConfig.movement.swayAmplitude;
            }

            const leftUpperArm = this.vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightUpperArm = this.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
            const leftLowerArm = this.vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
            const rightLowerArm = this.vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

            if (leftUpperArm) {
                leftUpperArm.rotation.z = -1.24;
                leftUpperArm.rotation.x = sway * 0.26;
                leftUpperArm.rotation.y = 0.05;
            }
            if (rightUpperArm) {
                rightUpperArm.rotation.z = 1.24;
                rightUpperArm.rotation.x = -sway * 0.26;
                rightUpperArm.rotation.y = -0.05;
            }
            if (leftLowerArm) {
                leftLowerArm.rotation.x = 0.35 + sway * 0.1;
                leftLowerArm.rotation.y = 0.12;
            }
            if (rightLowerArm) {
                rightLowerArm.rotation.x = 0.35 - sway * 0.1;
                rightLowerArm.rotation.y = -0.12;
            }
        }

        return false;
    }
}

import * as THREE from 'three';
import type { WorldPosition } from './CharacterConfig';
import { CharacterConfig } from './CharacterConfig';

export class NavigationController {
    private currentTarget: THREE.Vector3 = new THREE.Vector3();
    private targetRotationY: number = 0;
    private hasTarget: boolean = false;

    public setDestination(pos: WorldPosition): void {
        this.currentTarget.set(pos.x, pos.y, pos.z);
        this.targetRotationY = pos.rotationY !== undefined ? pos.rotationY : 0;
        this.hasTarget = true;
    }

    public clearDestination(): void {
        this.hasTarget = false;
    }

    public isNavigating(): boolean {
        return this.hasTarget;
    }

    public getTargetPosition(): THREE.Vector3 {
        return this.currentTarget;
    }

    public getTargetRotationY(): number {
        return this.targetRotationY;
    }

    public getDistanceToTarget(currentPos: THREE.Vector3): number {
        const dx = this.currentTarget.x - currentPos.x;
        const dz = this.currentTarget.z - currentPos.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    public getDirectionToTarget(currentPos: THREE.Vector3): THREE.Vector3 {
        const dir = new THREE.Vector3()
            .subVectors(this.currentTarget, currentPos);
        dir.y = 0; // Keep horizontal
        if (dir.lengthSq() > 0.0001) {
            dir.normalize();
        }
        return dir;
    }

    public getHeadingAngle(dir: THREE.Vector3): number {
        // In Three.js coordinate system where VRM model forward is +Z or -Z,
        // Math.atan2(dir.x, dir.z) gives the rotation around Y axis.
        return Math.atan2(dir.x, dir.z);
    }

    public hasArrived(currentPos: THREE.Vector3): boolean {
        if (!this.hasTarget) return true;
        return this.getDistanceToTarget(currentPos) <= CharacterConfig.movement.arrivalThreshold;
    }
}

import { VRM } from '@pixiv/three-vrm';
import { ExpressionController } from './ExpressionController';
import * as THREE from 'three';

export class AnimationController {
    public expressions: ExpressionController;
    private vrm: VRM;
    private lookAtTarget: THREE.Object3D;

    constructor(vrm: VRM, scene: THREE.Scene) {
        this.vrm = vrm;
        this.expressions = new ExpressionController(vrm);
        
        this.lookAtTarget = new THREE.Object3D();
        scene.add(this.lookAtTarget);
        if (this.vrm.lookAt) {
            this.vrm.lookAt.target = this.lookAtTarget;
        }
    }
    
    public setLookAtPosition(x: number, y: number, z: number) {
        this.lookAtTarget.position.set(x, y, z);
    }

    public update(delta: number) {
        this.expressions.smoothInterpolation(delta);
        this.vrm.update(delta);
    }
}

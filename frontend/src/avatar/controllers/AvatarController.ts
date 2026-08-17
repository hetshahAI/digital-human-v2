import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import { loadAvatar } from '../avatarLoader';
import { AnimationController } from './AnimationController';
import type { AnimationFrame } from '../animation/AnimationFrame';
import { BlinkController } from './BlinkController';
import { LookAtController } from './LookAtController';

import { AvatarStylingManager } from './AvatarStylingManager';

export class AvatarController {
    public vrm: VRM | null = null;
    public animation: AnimationController | null = null;
    private scene: THREE.Scene;
    
    private blinkController = new BlinkController();
    private lookAtController = new LookAtController();
    
    private currentFrame: AnimationFrame = { timestamp: 0, expressions: {} };

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.setupKeyboardDebug();
    }

    public async load(url: string) {
        this.vrm = await loadAvatar(url, this.scene);
        
        // Apply UAE Luxury Corporate Executive PBR styling
        AvatarStylingManager.applyExecutiveStyling(this.vrm, this.scene);

        this.animation = new AnimationController(this.vrm, this.scene);
    }

    public applyAnimationFrame(frame: AnimationFrame) {
        if (!this.animation) return;
        
        if (frame.expressions) {
            const exp = frame.expressions;
            if (exp.reset !== undefined) this.animation.expressions.resetExpressions();
            
            // Visemes
            if (exp.jawOpen !== undefined) this.animation.expressions.setJawOpen(exp.jawOpen);
            if (exp.vowelAa !== undefined) this.animation.expressions.setVowelAa(exp.vowelAa);
            if (exp.vowelIh !== undefined) this.animation.expressions.setVowelIh(exp.vowelIh);
            if (exp.vowelOu !== undefined) this.animation.expressions.setVowelOu(exp.vowelOu);
            if (exp.vowelEe !== undefined) this.animation.expressions.setVowelEe(exp.vowelEe);
            if (exp.vowelOh !== undefined) this.animation.expressions.setVowelOh(exp.vowelOh);
            if (exp.mouthFunnel !== undefined) this.animation.expressions.setMouthFunnel(exp.mouthFunnel);
            if (exp.mouthPucker !== undefined) this.animation.expressions.setMouthPucker(exp.mouthPucker);
            if (exp.mouthWide !== undefined) this.animation.expressions.setMouthWide(exp.mouthWide);
            
            // Emotions
            if (exp.smile !== undefined) this.animation.expressions.setSmile(exp.smile);
            if (exp.happy !== undefined) this.animation.expressions.setHappy(exp.happy);
            if (exp.surprised !== undefined) this.animation.expressions.setSurprised(exp.surprised);
            if (exp.relaxed !== undefined) this.animation.expressions.setRelaxed(exp.relaxed);
            if (exp.angry !== undefined) this.animation.expressions.setAngry(exp.angry);
            if (exp.sad !== undefined) this.animation.expressions.setSad(exp.sad);
            if (exp.neutral !== undefined) this.animation.expressions.setNeutral(exp.neutral);
            
            // Eyes & Brows
            if (exp.blink !== undefined) this.animation.expressions.setBlink(exp.blink);
            if (exp.blinkLeft !== undefined) this.animation.expressions.setBlinkLeft(exp.blinkLeft);
            if (exp.blinkRight !== undefined) this.animation.expressions.setBlinkRight(exp.blinkRight);
            if (exp.browUp !== undefined) this.animation.expressions.setBrowsUp(exp.browUp);
            if (exp.browDown !== undefined) this.animation.expressions.setBrowsDown(exp.browDown);
            if (exp.cheekPuff !== undefined) this.animation.expressions.setCheekPuff(exp.cheekPuff);
            if (exp.eyeSquint !== undefined) this.animation.expressions.setEyeSquint(exp.eyeSquint);
        }
        
        if (frame.lookAt) {
            this.animation.setLookAtPosition(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
        }
        
        this.currentFrame = { ...this.currentFrame, ...frame };
    }


    public setCharacterState(state: any): void {
        this.lookAtController.setState(state);
    }

    public update(delta: number) {
        if (this.animation) {
            const lookAtFrame = this.lookAtController.update(delta);
            this.applyAnimationFrame(lookAtFrame);
            
            const blinkFrame = this.blinkController.update(delta);
            if (blinkFrame) {
                this.applyAnimationFrame(blinkFrame);
            }

            this.animation.update(delta);
        }
    }


    private setupKeyboardDebug() {
        window.addEventListener('keydown', (e) => {
            const timestamp = performance.now();
            let frame: AnimationFrame | null = null;
            
            if (e.key === '1') {
                frame = { timestamp, expressions: { reset: 1, jawOpen: 1 } };
            } else if (e.key === '2') {
                frame = { timestamp, expressions: { reset: 1, smile: 1 } };
            } else if (e.key === '3') {
                frame = { timestamp, expressions: { reset: 1, blinkLeft: 1, blinkRight: 1 } };
            } else if (e.key === '4') {
                frame = { timestamp, expressions: { reset: 1, browUp: 1 } };
            } else if (e.key === '5') {
                frame = { timestamp, expressions: { reset: 1 } };
            }
            
            if (frame) {
                this.applyAnimationFrame(frame);
            }
        });
    }
}

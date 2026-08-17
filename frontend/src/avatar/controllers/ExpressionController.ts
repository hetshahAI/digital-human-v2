import { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';

export class ExpressionController {
    private vrm: VRM;
    private targets: Record<string, number> = {};
    private current: Record<string, number> = {};
    private speed: number = 18.0;

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    private setTarget(name: string, value: number) {
        this.targets[name] = Math.max(0, Math.min(1, value));
        if (this.current[name] === undefined) {
            this.current[name] = 0;
        }
    }

    // Visemes
    public setJawOpen(value: number) { this.setTarget(VRMExpressionPresetName.Aa, value); }
    public setVowelAa(value: number) { this.setTarget(VRMExpressionPresetName.Aa, value); }
    public setVowelIh(value: number) { this.setTarget(VRMExpressionPresetName.Ih, value); }
    public setVowelOu(value: number) { this.setTarget(VRMExpressionPresetName.Ou, value); }
    public setVowelEe(value: number) { this.setTarget(VRMExpressionPresetName.Ee, value); }
    public setVowelOh(value: number) { this.setTarget(VRMExpressionPresetName.Oh, value); }
    public setMouthFunnel(value: number) { this.setTarget(VRMExpressionPresetName.Ou, value); }
    public setMouthPucker(value: number) { this.setTarget(VRMExpressionPresetName.Oh, value); }
    public setMouthWide(value: number) { this.setTarget(VRMExpressionPresetName.Ih, value * 0.8); }

    // Emotions & Brows
    public setSmile(value: number) { this.setTarget(VRMExpressionPresetName.Happy, value); }
    public setHappy(value: number) { this.setTarget(VRMExpressionPresetName.Happy, value); }
    public setSurprised(value: number) { this.setTarget(VRMExpressionPresetName.Surprised, value); }
    public setRelaxed(value: number) { this.setTarget(VRMExpressionPresetName.Relaxed, value); }
    public setAngry(value: number) { this.setTarget(VRMExpressionPresetName.Angry, value); }
    public setSad(value: number) { this.setTarget(VRMExpressionPresetName.Sad, value); }
    public setNeutral(value: number) { this.setTarget(VRMExpressionPresetName.Neutral, value); }

    public setBrowsUp(value: number) { this.setTarget(VRMExpressionPresetName.Surprised, value); }
    public setBrowsDown(value: number) { this.setTarget(VRMExpressionPresetName.Angry, value); }
    public setCheekPuff(value: number) { this.setTarget(VRMExpressionPresetName.Happy, value * 0.5); }
    public setEyeSquint(value: number) { this.setTarget(VRMExpressionPresetName.Blink, value * 0.5); }

    // Blinking
    public setBlink(value: number) { this.setTarget(VRMExpressionPresetName.Blink, value); }
    public setBlinkLeft(value: number) { this.setTarget(VRMExpressionPresetName.BlinkLeft, value); }
    public setBlinkRight(value: number) { this.setTarget(VRMExpressionPresetName.BlinkRight, value); }

    public resetExpressions() {
        for (const key in this.targets) {
            this.targets[key] = 0;
        }
    }

    public smoothInterpolation(delta: number) {
        if (!this.vrm.expressionManager) return;
        const dt = Math.min(delta, 0.1);

        // Blinking constraints logic
        // If surprised, eyes open wide, blink less
        // If angry/squinting, blink amplitude is dampened
        const isSurprised = this.targets[VRMExpressionPresetName.Surprised] || 0;
        const isAngry = this.targets[VRMExpressionPresetName.Angry] || 0;
        const isHappy = this.targets[VRMExpressionPresetName.Happy] || 0;
        
        let blinkDampener = 1.0;
        if (isSurprised > 0.3) blinkDampener = 0.4;
        if (isAngry > 0.5) blinkDampener = 0.8;
        if (isHappy > 0.5) blinkDampener = 0.9;
        
        for (const key in this.targets) {
            let target = this.targets[key];
            
            // Apply blink constraints
            if (key === VRMExpressionPresetName.Blink || 
                key === VRMExpressionPresetName.BlinkLeft || 
                key === VRMExpressionPresetName.BlinkRight) {
                target *= blinkDampener;
            }

            const current = this.current[key];
            // Adaptive speed: facial expressions should be fast to activate but slightly slower to relax
            const diff = target - current;
            const adaptiveSpeed = diff > 0 ? this.speed * 1.5 : this.speed * 0.8;
            
            const next = current + diff * adaptiveSpeed * dt;
            this.current[key] = next;
            try {
                this.vrm.expressionManager.setValue(key, next);
            } catch (err) {
                // Silently ignore expressions not supported by specific VRM
            }
        }
    }
}


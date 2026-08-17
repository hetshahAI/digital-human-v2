import type { AnimationFrame } from '../animation/AnimationFrame';
import { CharacterState } from '../../character/CharacterState';

export class BlinkController {
    private nextBlinkTime: number = 0;
    private isBlinking: boolean = false;
    private blinkDuration: number = 0.14;
    private blinkTimer: number = 0;
    private isDoubleBlinkQueued: boolean = false;

    constructor() {
        this.scheduleNextBlink();
    }

    private scheduleNextBlink(isQuickFollowup: boolean = false) {
        if (isQuickFollowup) {
            this.nextBlinkTime = 0.08 + Math.random() * 0.12;
        } else {
            // Natural human blink distribution: 2.2s to 4.8s
            this.nextBlinkTime = 2.2 + Math.random() * 2.6;
            this.isDoubleBlinkQueued = Math.random() < 0.18; // 18% double-blink chance
        }
    }

    public setState(_state: CharacterState): void {
        // Blink rate changes could be tied to state here
    }

    public update(delta: number): AnimationFrame | null {
        if (this.isBlinking) {
            this.blinkTimer -= delta;
            if (this.blinkTimer <= 0) {
                this.isBlinking = false;
                if (this.isDoubleBlinkQueued) {
                    this.isDoubleBlinkQueued = false;
                    this.scheduleNextBlink(true);
                } else {
                    this.scheduleNextBlink(false);
                }
                return { timestamp: performance.now(), expressions: { blinkLeft: 0, blinkRight: 0 } };
            } else {
                const progress = 1.0 - (this.blinkTimer / this.blinkDuration);
                // Fast closing phase (0.0 to 0.35), natural elastic reopening (0.35 to 1.0)
                let value = 0;
                if (progress < 0.35) {
                    value = Math.sin((progress / 0.35) * (Math.PI / 2));
                } else {
                    value = Math.cos(((progress - 0.35) / 0.65) * (Math.PI / 2));
                }
                return { timestamp: performance.now(), expressions: { blinkLeft: value, blinkRight: value } };
            }
        } else {
            this.nextBlinkTime -= delta;
            if (this.nextBlinkTime <= 0) {
                this.isBlinking = true;
                this.blinkTimer = this.blinkDuration;
            }
            return null;
        }
    }
}

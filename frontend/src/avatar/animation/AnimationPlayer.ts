import type { AnimationFrame } from './AnimationFrame';
import { AvatarController } from '../controllers/AvatarController';

export class AnimationPlayer {
    private avatarController: AvatarController;
    private frameQueue: AnimationFrame[] = [];
    
    constructor(avatarController: AvatarController) {
        this.avatarController = avatarController;
    }

    public queueFrame(frame: AnimationFrame) {
        this.frameQueue.push(frame);
    }
    
    public update() {
        if (this.frameQueue.length > 0) {
            // Apply immediately, or interpolate based on timeline (omitted for basic queue pop)
            const frame = this.frameQueue.shift()!;
            this.avatarController.applyAnimationFrame(frame);
        }
    }
}

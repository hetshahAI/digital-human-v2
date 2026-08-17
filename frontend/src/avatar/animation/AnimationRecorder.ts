import type { AnimationFrame } from './AnimationFrame';

export class AnimationRecorder {
    private frames: AnimationFrame[] = [];
    private isRecording: boolean = false;
    private startTime: number = 0;

    public startRecording() {
        this.frames = [];
        this.isRecording = true;
        this.startTime = performance.now();
    }

    public recordFrame(frame: AnimationFrame) {
        if (!this.isRecording) return;
        this.frames.push({
            ...frame,
            timestamp: performance.now() - this.startTime
        });
    }

    public stopRecording() {
        this.isRecording = false;
    }

    public getFrames(): AnimationFrame[] {
        return this.frames;
    }
    
    public clear() {
        this.frames = [];
    }
}

import type { AnimationFrame } from '../animation/AnimationFrame';
import { NeuroSyncAdapter, type NeuroSyncCoefficients } from './NeuroSyncAdapter';

export interface TimestampedNeuroSyncFrame {
    timestamp: number; // Absolute AudioContext time in seconds
    coefficients: number[] | NeuroSyncCoefficients;
}

export class NeuroSyncController {
    private neuralTimelineFrames: TimestampedNeuroSyncFrame[] = [];
    private fallbackTimelineFrames: TimestampedNeuroSyncFrame[] = [];
    private smoothedExpressions: Record<string, number> = {};

    // Physics-based attack (32/s) & decay (18/s) smoothing for VRM facial expression muscles
    private attackSpeed: number = 32.0;
    private decaySpeed: number = 18.0;

    constructor() {}

    public reset(): void {
        this.neuralTimelineFrames = [];
        this.fallbackTimelineFrames = [];
        this.smoothedExpressions = {};
    }

    /**
     * Ingests real 61-dimensional neural blendshape animation frames from the remote NeuroSync API.
     * @param frames Array of 61-element float vectors [T, 61]
     * @param scheduledStartTime Exact AudioContext playback start time in seconds
     */
    public ingestRemoteNeuralFrames(frames: any[], scheduledStartTime: number): void {
        if (!frames || frames.length === 0) return;

        const fps = 60;
        const frameDuration = 1.0 / fps; // 0.01667s

        for (let i = 0; i < frames.length; i++) {
            const frameTime = scheduledStartTime + (i * frameDuration);
            this.neuralTimelineFrames.push({
                timestamp: frameTime,
                coefficients: frames[i]
            });
        }
        console.log(`[NEUROSYNC] Queued ${frames.length} REAL_REMOTE_NEUROSYNC frames at scheduledStartTime=${scheduledStartTime.toFixed(3)}s`);
    }

    /**
     * Fallback processor (DFT heuristic) when remote server is offline.
     */
    public processAudioBuffer(
        audioData: Float32Array,
        sampleRate: number,
        scheduledStartTime: number
    ): void {
        if (audioData.length === 0) return;

        const fps = 60;
        const frameDuration = 1.0 / fps;
        const samplesPerFrame = Math.floor(sampleRate / fps);
        const numFrames = Math.ceil(audioData.length / samplesPerFrame);

        const windowSize = 512;
        const hanningWindow = new Float32Array(windowSize);
        for (let i = 0; i < windowSize; i++) {
            hanningWindow[i] = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / (windowSize - 1)));
        }

        for (let f = 0; f < numFrames; f++) {
            const startSample = f * samplesPerFrame;
            const endSample = Math.min(audioData.length, startSample + samplesPerFrame);
            const frameSamples = audioData.subarray(startSample, endSample);

            let sumSq = 0;
            for (let i = 0; i < frameSamples.length; i++) {
                sumSq += frameSamples[i] * frameSamples[i];
            }
            const rms = Math.sqrt(sumSq / Math.max(1, frameSamples.length));

            const padded = new Float32Array(windowSize);
            for (let i = 0; i < windowSize && (startSample + i) < audioData.length; i++) {
                padded[i] = audioData[startSample + i] * hanningWindow[i];
            }

            let lowEnergy = 0;
            let midEnergy = 0;
            let highEnergy = 0;

            const binHz = sampleRate / windowSize;
            const f1Start = Math.max(1, Math.floor(200 / binHz));
            const f1End = Math.min(windowSize / 2, Math.floor(850 / binHz));
            const f2Start = Math.floor(850 / binHz);
            const f2End = Math.min(windowSize / 2, Math.floor(2400 / binHz));
            const f3Start = Math.floor(2400 / binHz);
            const f3End = Math.min(windowSize / 2, Math.floor(7500 / binHz));

            for (let k = f1Start; k < f3End && k < windowSize / 2; k++) {
                let real = 0;
                let imag = 0;
                const angle = (2 * Math.PI * k) / windowSize;
                for (let n = 0; n < windowSize; n++) {
                    real += padded[n] * Math.cos(angle * n);
                    imag -= padded[n] * Math.sin(angle * n);
                }
                const mag = Math.sqrt(real * real + imag * imag);

                if (k <= f1End) lowEnergy += mag;
                else if (k <= f2End) midEnergy += mag;
                else if (k <= f3End) highEnergy += mag;
            }

            const normLow = Math.min(1.0, lowEnergy / (Math.max(1, f1End - f1Start) * 1.5));
            const normMid = Math.min(1.0, midEnergy / (Math.max(1, f2End - f2Start) * 1.2));
            const normHigh = Math.min(1.0, highEnergy / (Math.max(1, f3End - f3Start) * 0.8));

            const coeffs: NeuroSyncCoefficients = {
                jawOpen: 0,
                mouthClose: 0.9,
                mouthFunnel: 0,
                mouthPucker: 0,
                mouthSmileLeft: 0,
                mouthSmileRight: 0,
                mouthStretchLeft: 0,
                mouthStretchRight: 0,
                vowelAa: 0,
                vowelIh: 0,
                vowelOu: 0,
                vowelEe: 0,
                vowelOh: 0
            };

            if (rms > 0.012 || normLow > 0.08 || normMid > 0.08) {
                coeffs.mouthClose = 0.0;
                const intensity = Math.min(1.0, rms * 14.0 + normLow * 0.4);
                coeffs.jawOpen = Math.min(0.48, intensity * 0.45 + normLow * 0.22);
                coeffs.vowelAa = Math.min(0.50, normLow * 0.70 * intensity);
                coeffs.vowelIh = Math.min(0.45, normMid * 0.65 * intensity);
                coeffs.vowelEe = Math.min(0.42, (normMid * 0.50 + normLow * 0.20) * intensity);
                const stretch = Math.min(0.45, normMid * 0.55);
                coeffs.mouthStretchLeft = stretch;
                coeffs.mouthStretchRight = stretch;

                if (normLow > normMid * 1.15) {
                    const roundness = Math.min(0.45, (normLow - normMid * 0.3) * 0.75 * intensity);
                    coeffs.vowelOu = roundness;
                    coeffs.mouthFunnel = roundness;
                    coeffs.mouthPucker = Math.min(0.40, roundness * 0.75);
                }
                if (normLow > 0.25 && normMid < 0.35) {
                    coeffs.vowelOh = Math.min(0.45, normLow * 0.55);
                    coeffs.mouthPucker = Math.max(coeffs.mouthPucker, coeffs.vowelOh * 0.5);
                }
                if (normHigh > 0.3 && normLow < 0.3) {
                    coeffs.jawOpen = Math.min(coeffs.jawOpen, 0.25);
                    coeffs.mouthStretchLeft = Math.max(coeffs.mouthStretchLeft, 0.35);
                    coeffs.mouthStretchRight = Math.max(coeffs.mouthStretchRight, 0.35);
                    coeffs.vowelIh = Math.max(coeffs.vowelIh, 0.30);
                }
                const smile = Math.min(0.25, coeffs.mouthStretchLeft * 0.4);
                coeffs.mouthSmileLeft = smile;
                coeffs.mouthSmileRight = smile;
            }

            const frameTime = scheduledStartTime + f * frameDuration;
            this.fallbackTimelineFrames.push({
                timestamp: frameTime,
                coefficients: coeffs
            });
        }
    }

    /**
     * Updates facial blendshapes in lockstep with the actual AudioContext playback clock.
     */
    public update(audioContextTime: number, delta: number): AnimationFrame {
        const dt = Math.min(delta, 0.05);

        // Clean expired frames older than 2.0s ago
        while (this.neuralTimelineFrames.length > 2 && this.neuralTimelineFrames[1].timestamp < (audioContextTime - 2.0)) {
            this.neuralTimelineFrames.shift();
        }
        while (this.fallbackTimelineFrames.length > 2 && this.fallbackTimelineFrames[1].timestamp < (audioContextTime - 2.0)) {
            this.fallbackTimelineFrames.shift();
        }

        let targetWeights: Record<string, number> = {};

        // 1. Prioritize Real Remote Neural Frames
        if (this.neuralTimelineFrames.length > 0) {
            const firstFrame = this.neuralTimelineFrames[0];
            const lastFrame = this.neuralTimelineFrames[this.neuralTimelineFrames.length - 1];

            if (audioContextTime >= firstFrame.timestamp && audioContextTime <= (lastFrame.timestamp + 0.1)) {
                let idx = 0;
                for (let i = 0; i < this.neuralTimelineFrames.length - 1; i++) {
                    if (this.neuralTimelineFrames[i].timestamp <= audioContextTime && audioContextTime < this.neuralTimelineFrames[i + 1].timestamp) {
                        idx = i;
                        break;
                    }
                    if (i === this.neuralTimelineFrames.length - 2) {
                        idx = i;
                    }
                }

                const frameA = this.neuralTimelineFrames[idx];
                const frameB = this.neuralTimelineFrames[Math.min(this.neuralTimelineFrames.length - 1, idx + 1)];

                const span = Math.max(0.0001, frameB.timestamp - frameA.timestamp);
                const rawAlpha = Math.max(0, Math.min(1.0, (audioContextTime - frameA.timestamp) / span));
                const alpha = rawAlpha * rawAlpha * (3.0 - 2.0 * rawAlpha);

                const blendedVector: number[] = [];
                const vecA = frameA.coefficients as number[];
                const vecB = frameB.coefficients as number[];

                if (Array.isArray(vecA) && Array.isArray(vecB)) {
                    const maxLen = Math.max(vecA.length, vecB.length);
                    for (let c = 0; c < maxLen; c++) {
                        const valA = vecA[c] || 0;
                        const valB = vecB[c] || 0;
                        blendedVector.push(valA + (valB - valA) * alpha);
                    }
                    targetWeights = NeuroSyncAdapter.mapARKit61ToVRM(blendedVector);
                }
            }
        }

        // 2. Fallback Heuristic Frames if no neural frame active
        if (Object.keys(targetWeights).length === 0 && this.fallbackTimelineFrames.length > 0) {
            const firstFrame = this.fallbackTimelineFrames[0];
            const lastFrame = this.fallbackTimelineFrames[this.fallbackTimelineFrames.length - 1];

            if (audioContextTime >= firstFrame.timestamp && audioContextTime <= (lastFrame.timestamp + 0.1)) {
                let idx = 0;
                for (let i = 0; i < this.fallbackTimelineFrames.length - 1; i++) {
                    if (this.fallbackTimelineFrames[i].timestamp <= audioContextTime && audioContextTime < this.fallbackTimelineFrames[i + 1].timestamp) {
                        idx = i;
                        break;
                    }
                    if (i === this.fallbackTimelineFrames.length - 2) {
                        idx = i;
                    }
                }

                const frameA = this.fallbackTimelineFrames[idx];
                const frameB = this.fallbackTimelineFrames[Math.min(this.fallbackTimelineFrames.length - 1, idx + 1)];

                const span = Math.max(0.0001, frameB.timestamp - frameA.timestamp);
                const rawAlpha = Math.max(0, Math.min(1.0, (audioContextTime - frameA.timestamp) / span));
                const alpha = rawAlpha * rawAlpha * (3.0 - 2.0 * rawAlpha);

                const cA = frameA.coefficients as NeuroSyncCoefficients;
                const cB = frameB.coefficients as NeuroSyncCoefficients;
                const blend = (a: number = 0, b: number = 0) => a + (b - a) * alpha;

                const blendedCoeffs: NeuroSyncCoefficients = {
                    jawOpen: blend(cA.jawOpen, cB.jawOpen),
                    mouthClose: blend(cA.mouthClose, cB.mouthClose),
                    mouthFunnel: blend(cA.mouthFunnel, cB.mouthFunnel),
                    mouthPucker: blend(cA.mouthPucker, cB.mouthPucker),
                    mouthSmileLeft: blend(cA.mouthSmileLeft, cB.mouthSmileLeft),
                    mouthSmileRight: blend(cA.mouthSmileRight, cB.mouthSmileRight),
                    mouthStretchLeft: blend(cA.mouthStretchLeft, cB.mouthStretchLeft),
                    mouthStretchRight: blend(cA.mouthStretchRight, cB.mouthStretchRight),
                    vowelAa: blend(cA.vowelAa, cB.vowelAa),
                    vowelIh: blend(cA.vowelIh, cB.vowelIh),
                    vowelOu: blend(cA.vowelOu, cB.vowelOu),
                    vowelEe: blend(cA.vowelEe, cB.vowelEe),
                    vowelOh: blend(cA.vowelOh, cB.vowelOh)
                };
                targetWeights = NeuroSyncAdapter.mapToVRM(blendedCoeffs);
            }
        }

        // Apply smooth anatomical attack/decay transitions across both active and retreating expressions
        const allKeys = new Set([...Object.keys(this.smoothedExpressions), ...Object.keys(targetWeights)]);
        for (const key of allKeys) {
            const targetVal = targetWeights[key] || 0.0;
            const currentVal = this.smoothedExpressions[key] || 0.0;
            const speed = targetVal > currentVal ? this.attackSpeed : this.decaySpeed;
            const step = Math.min(1.0, speed * dt);
            const nextVal = currentVal + (targetVal - currentVal) * step;
            if (nextVal < 0.001 && targetVal === 0.0) {
                delete this.smoothedExpressions[key];
            } else {
                this.smoothedExpressions[key] = nextVal;
            }
        }

        return {
            timestamp: performance.now(),
            expressions: { ...this.smoothedExpressions }
        };
    }
}

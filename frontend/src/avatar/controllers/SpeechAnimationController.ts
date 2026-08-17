import type { AnimationFrame } from '../animation/AnimationFrame';

export class SpeechAnimationController {
    private analyser: AnalyserNode;
    private freqData: Uint8Array<ArrayBuffer>;
    private timeData: Float32Array<ArrayBuffer>;

    // Smoothed viseme values
    private jawOpen: number = 0;
    private vowelAa: number = 0;
    private vowelIh: number = 0;
    private vowelOu: number = 0;
    private vowelEe: number = 0;
    private vowelOh: number = 0;
    private mouthWide: number = 0;
    private mouthFunnel: number = 0;
    private mouthPucker: number = 0;

    constructor(analyser: AnalyserNode) {
        this.analyser = analyser;
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.timeData = new Float32Array(this.analyser.fftSize);
    }

    public setSpeaking(_speaking: boolean) {
        // Can be used for state toggles if needed
    }

    public update(delta: number): AnimationFrame {
        const dt = Math.min(delta, 0.1);

        // Get time-domain data for RMS
        this.analyser.getFloatTimeDomainData(this.timeData);
        let sumSquares = 0;
        for (let i = 0; i < this.timeData.length; i++) {
            sumSquares += this.timeData[i] * this.timeData[i];
        }
        const rms = Math.sqrt(sumSquares / this.timeData.length);

        // Get frequency-domain data for formant estimation
        this.analyser.getByteFrequencyData(this.freqData);

        // Sample rate is typically 44100 or 48000 Hz; binCount = fftSize / 2 = 256
        const binHz = 44100 / this.analyser.fftSize;

        // Band 1: Low (F1: 200 - 800 Hz) -> Open vowels (Aa, Oh)
        let lowEnergy = 0;
        let lowCount = 0;
        const lowStart = Math.max(1, Math.floor(200 / binHz));
        const lowEnd = Math.min(this.freqData.length - 1, Math.floor(800 / binHz));
        for (let i = lowStart; i <= lowEnd; i++) {
            lowEnergy += this.freqData[i];
            lowCount++;
        }
        const lowNorm = lowCount > 0 ? (lowEnergy / lowCount) / 255.0 : 0;

        // Band 2: Mid (F2: 800 - 2400 Hz) -> Front/spread vowels (Ih, Ee) & mouth wide
        let midEnergy = 0;
        let midCount = 0;
        const midStart = Math.floor(800 / binHz);
        const midEnd = Math.min(this.freqData.length - 1, Math.floor(2400 / binHz));
        for (let i = midStart; i <= midEnd; i++) {
            midEnergy += this.freqData[i];
            midCount++;
        }
        const midNorm = midCount > 0 ? (midEnergy / midCount) / 255.0 : 0;

        // Band 3: High (2400 - 6000 Hz) -> Sibilants, fricatives (S, T, Ch, F)
        let highEnergy = 0;
        let highCount = 0;
        const highStart = Math.floor(2400 / binHz);
        const highEnd = Math.min(this.freqData.length - 1, Math.floor(6000 / binHz));
        for (let i = highStart; i <= highEnd; i++) {
            highEnergy += this.freqData[i];
            highCount++;
        }
        const highNorm = highCount > 0 ? (highEnergy / highCount) / 255.0 : 0;

        // Determine targets based on audio presence
        let targetJaw = 0;
        let targetAa = 0;
        let targetIh = 0;
        let targetOu = 0;
        let targetEe = 0;
        let targetOh = 0;
        let targetWide = 0;
        let targetFunnel = 0;
        let targetPucker = 0;

        // Only generate visemes when audio exceeds gate threshold
        if (rms > 0.008 || (lowNorm > 0.1 || midNorm > 0.1)) {
            // General speech intensity
            const intensity = Math.min(1.0, rms * 14.0 + lowNorm * 0.4);

            // Jaw opening
            targetJaw = Math.min(1.0, intensity * 0.95);

            // Vowel Aa (wide open jaw + low formant)
            targetAa = Math.min(1.0, lowNorm * 1.2 * intensity);

            // Vowel Ih / Ee (spread mouth + high F2)
            targetIh = Math.min(0.9, midNorm * 1.1 * intensity);
            targetEe = Math.min(0.8, (midNorm * 0.7 + lowNorm * 0.3) * intensity);
            targetWide = Math.min(0.7, midNorm * 0.9);

            // Rounded vowels Ou / Oh (low F2 relative to F1)
            if (lowNorm > midNorm * 1.1) {
                targetOu = Math.min(0.85, (lowNorm - midNorm * 0.5) * 1.2 * intensity);
                targetFunnel = Math.min(0.75, targetOu);
            }
            if (lowNorm > 0.3 && midNorm < 0.4) {
                targetOh = Math.min(0.8, lowNorm * 0.9);
                targetPucker = Math.min(0.6, targetOh * 0.7);
            }

            // High frequency fricative mouth narrowing
            if (highNorm > 0.35 && lowNorm < 0.25) {
                targetIh = Math.max(targetIh, 0.4);
                targetWide = Math.max(targetWide, 0.5);
                targetJaw = Math.min(targetJaw, 0.3);
            }
        }

        // Asymmetric attack & decay smoothing
        const attack = 35.0;
        const decay = 18.0;

        const smooth = (curr: number, target: number): number => {
            const speed = target > curr ? attack : decay;
            return curr + (target - curr) * Math.min(1.0, speed * dt);
        };

        this.jawOpen = smooth(this.jawOpen, targetJaw);
        this.vowelAa = smooth(this.vowelAa, targetAa);
        this.vowelIh = smooth(this.vowelIh, targetIh);
        this.vowelOu = smooth(this.vowelOu, targetOu);
        this.vowelEe = smooth(this.vowelEe, targetEe);
        this.vowelOh = smooth(this.vowelOh, targetOh);
        this.mouthWide = smooth(this.mouthWide, targetWide);
        this.mouthFunnel = smooth(this.mouthFunnel, targetFunnel);
        this.mouthPucker = smooth(this.mouthPucker, targetPucker);

        return {
            timestamp: performance.now(),
            expressions: {
                jawOpen: this.jawOpen,
                vowelAa: this.vowelAa,
                vowelIh: this.vowelIh,
                vowelOu: this.vowelOu,
                vowelEe: this.vowelEe,
                vowelOh: this.vowelOh,
                mouthWide: this.mouthWide,
                mouthFunnel: this.mouthFunnel,
                mouthPucker: this.mouthPucker,
                smile: this.mouthWide * 0.4
            }
        };
    }
}

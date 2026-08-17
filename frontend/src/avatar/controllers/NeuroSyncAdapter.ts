import { VRMExpressionPresetName } from '@pixiv/three-vrm';

export interface NeuroSyncCoefficients {
    jawOpen: number;
    jawForward?: number;
    jawLeft?: number;
    jawRight?: number;
    mouthClose: number;
    mouthFunnel: number;
    mouthPucker: number;
    mouthSmileLeft: number;
    mouthSmileRight: number;
    mouthFrownLeft?: number;
    mouthFrownRight?: number;
    mouthStretchLeft: number;
    mouthStretchRight: number;
    mouthRollLower?: number;
    mouthRollUpper?: number;
    mouthShrugLower?: number;
    mouthShrugUpper?: number;
    mouthPressLeft?: number;
    mouthPressRight?: number;
    mouthLowerDownLeft?: number;
    mouthLowerDownRight?: number;
    mouthUpperUpLeft?: number;
    mouthUpperUpRight?: number;
    vowelAa?: number;
    vowelIh?: number;
    vowelOu?: number;
    vowelEe?: number;
    vowelOh?: number;
    cheekPuff?: number;
    browInnerUp?: number;
    browDownLeft?: number;
    browDownRight?: number;
    [key: string]: number | undefined;
}

export interface VRMExpressionWeights {
    [key: string]: number;
}

export class NeuroSyncAdapter {
    /**
     * Maps an array of 61 raw neural blendshape coefficients (or named dictionary)
     * received from the remote NeuroSync API directly to VRM expressions and morph targets.
     */
    public static mapARKit61ToVRM(input: number[] | Record<string, number> | NeuroSyncCoefficients): VRMExpressionWeights {
        const weights: VRMExpressionWeights = {};

        let jawOpen = 0;
        let mouthClose = 0;
        let mouthFunnel = 0;
        let mouthPucker = 0;
        let mouthSmileL = 0;
        let mouthSmileR = 0;
        let mouthStretchL = 0;
        let mouthStretchR = 0;
        let mouthLowerDown = 0;
        let browUp = 0;
        let browDown = 0;
        let emotionHappy = 0;

        if (Array.isArray(input)) {
            // Indexing matching Apple ARKit 52 + NeuroSync 61 specification
            jawOpen = input[17] || 0;
            mouthClose = input[18] || 0;
            mouthFunnel = input[19] || 0;
            mouthPucker = input[20] || 0;
            mouthSmileL = input[23] || 0;
            mouthSmileR = input[24] || 0;
            mouthStretchL = input[29] || 0;
            mouthStretchR = input[30] || 0;
            mouthLowerDown = ((input[37] || 0) + (input[38] || 0)) * 0.5;
            browDown = ((input[47] || 0) + (input[48] || 0)) * 0.5;
            browUp = input[49] || 0;
            if (input.length > 54) emotionHappy = input[54] || 0;
        } else if (typeof input === 'object' && input !== null) {
            const map = input as Record<string, number | undefined>;
            jawOpen = map['jawOpen'] || map['JawOpen'] || 0;
            mouthClose = map['mouthClose'] || map['MouthClose'] || 0;
            mouthFunnel = map['mouthFunnel'] || map['MouthFunnel'] || 0;
            mouthPucker = map['mouthPucker'] || map['MouthPucker'] || 0;
            mouthSmileL = map['mouthSmileLeft'] || map['MouthSmileLeft'] || 0;
            mouthSmileR = map['mouthSmileRight'] || map['MouthSmileRight'] || 0;
            mouthStretchL = map['mouthStretchLeft'] || map['MouthStretchLeft'] || 0;
            mouthStretchR = map['mouthStretchRight'] || map['MouthStretchRight'] || 0;
            browUp = map['browInnerUp'] || map['BrowInnerUp'] || 0;
            browDown = map['browDownLeft'] || map['BrowDownLeft'] || 0;
            emotionHappy = map['emotionHappy'] || 0;
        }

        // 1. Jaw Open / Vowel 'Aa'
        const effectiveJaw = Math.max(0, Math.min(0.48, (jawOpen * 0.50 + mouthLowerDown * 0.20) * (1.0 - mouthClose * 0.85)));
        weights[VRMExpressionPresetName.Aa] = effectiveJaw;

        // 2. Spread Vowels 'Ih' / 'Ee' (Lateral lip stretch)
        const stretchAvg = (mouthStretchL + mouthStretchR) * 0.5;
        const effectiveIh = Math.max(0, Math.min(0.45, stretchAvg * 0.50 * (1.0 - mouthPucker * 0.7)));
        weights[VRMExpressionPresetName.Ih] = effectiveIh;
        weights[VRMExpressionPresetName.Ee] = effectiveIh * 0.8;

        // 3. Rounded Vowels 'Ou' / 'Oh' (Funnel & Pucker)
        const effectiveOu = Math.max(0, Math.min(0.42, mouthFunnel * 0.50 + mouthPucker * 0.35));
        const effectiveOh = Math.max(0, Math.min(0.42, mouthPucker * 0.50 + mouthFunnel * 0.30));
        weights[VRMExpressionPresetName.Ou] = effectiveOu;
        weights[VRMExpressionPresetName.Oh] = effectiveOh;

        // 4. Subtle speech smiling / emotional cadence
        const smileAvg = (mouthSmileL + mouthSmileR) * 0.5;
        if (smileAvg > 0.05 || emotionHappy > 0.1) {
            weights[VRMExpressionPresetName.Happy] = Math.min(0.6, Math.max(smileAvg * 0.7, emotionHappy * 0.5));
        }

        // 5. Eyebrows (if model conveys emotional speech dynamics)
        if (browUp > 0.1) weights[VRMExpressionPresetName.Surprised] = Math.min(0.4, browUp * 0.5);
        if (browDown > 0.15) weights[VRMExpressionPresetName.Angry] = Math.min(0.3, browDown * 0.4);

        // 6. Direct blendshape passthroughs
        weights['jawOpen'] = effectiveJaw;
        weights['mouthFunnel'] = effectiveOu;
        weights['mouthPucker'] = effectiveOh;
        weights['mouthWide'] = effectiveIh;
        weights['mouthClose'] = mouthClose;

        return weights;
    }

    /**
     * Legacy mapping function for fallback heuristic frames.
     */
    public static mapToVRM(coeffs: NeuroSyncCoefficients): VRMExpressionWeights {
        return this.mapARKit61ToVRM(coeffs);
    }
}

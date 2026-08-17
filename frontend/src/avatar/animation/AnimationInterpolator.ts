import type { AnimationFrame } from './AnimationFrame';

export class AnimationInterpolator {
    public static interpolate(frameA: AnimationFrame, frameB: AnimationFrame, alpha: number): AnimationFrame {
        const expressions: Record<string, number> = {};
        const keys = new Set([...Object.keys(frameA.expressions), ...Object.keys(frameB.expressions)]);
        
        keys.forEach(key => {
            const a = frameA.expressions[key] || 0;
            const b = frameB.expressions[key] || 0;
            expressions[key] = a + (b - a) * alpha;
        });

        const result: AnimationFrame = {
            timestamp: frameA.timestamp + (frameB.timestamp - frameA.timestamp) * alpha,
            expressions,
            emotion: frameB.emotion || frameA.emotion,
            metadata: frameB.metadata || frameA.metadata
        };

        if (frameA.lookAt && frameB.lookAt) {
            result.lookAt = {
                x: frameA.lookAt.x + (frameB.lookAt.x - frameA.lookAt.x) * alpha,
                y: frameA.lookAt.y + (frameB.lookAt.y - frameA.lookAt.y) * alpha,
                z: frameA.lookAt.z + (frameB.lookAt.z - frameA.lookAt.z) * alpha
            };
        } else {
            result.lookAt = frameB.lookAt || frameA.lookAt;
        }

        if (frameA.headRotation && frameB.headRotation) {
            const qa = frameA.headRotation;
            const qb = frameB.headRotation;
            result.headRotation = {
                x: qa.x + (qb.x - qa.x) * alpha,
                y: qa.y + (qb.y - qa.y) * alpha,
                z: qa.z + (qb.z - qa.z) * alpha,
                w: qa.w + (qb.w - qa.w) * alpha
            };
        } else {
            result.headRotation = frameB.headRotation || frameA.headRotation;
        }

        return result;
    }
}

export interface AnimationFrame {
    timestamp: number;
    expressions: Record<string, number>;
    lookAt?: { x: number; y: number; z: number };
    headRotation?: { x: number; y: number; z: number; w: number };
    emotion?: string;
    metadata?: any;
}

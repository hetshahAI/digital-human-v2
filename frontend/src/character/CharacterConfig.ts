export interface WorldPosition {
    x: number;
    y: number;
    z: number;
    rotationY?: number; // Target orientation in radians
}

export const CharacterConfig = {
    positions: {
        // Alicia's home/work area behind the executive reception desk
        HOME: {
            x: -0.85,
            y: 0,
            z: -0.95,
            rotationY: 0.0 // Faces directly forward toward visitor
        } as WorldPosition,

        // Position where Alicia stands to talk face-to-face with the user
        CONVERSATION: {
            x: -0.85,
            y: 0,
            z: -0.95,
            rotationY: 0.0
        } as WorldPosition,

        // Work position behind reception console
        WORK: {
            x: -0.85,
            y: 0,
            z: -0.95,
            rotationY: 0.0
        } as WorldPosition,

    },

    movement: {
        walkSpeed: 1.4,          // Units per second
        rotationSpeed: 4.5,      // Radians per second
        arrivalThreshold: 0.08,  // Distance in units to consider arrived
        angleThreshold: 0.05,    // Angle in radians to consider oriented
        bobbingFrequency: 7.5,   // Walk stride cycle speed
        bobbingAmplitude: 0.025, // Vertical walk bob in meters
        swayAmplitude: 0.015,    // Side-to-side walk sway
    },

    idle: {
        breathingFrequency: 1.8, // Radians per sec
        breathingAmplitude: 0.018,// Spine rotation amplitude
        headDriftFrequency: 0.4, // Subtle head wander
        headDriftAmplitude: 0.05,
    },

    timings: {
        noticeDuration: 0.8,     // Pause when noticing user before walking
        arrivalPause: 0.5,       // Pause after arriving before greeting
        goodbyePause: 1.2,       // Pause on goodbye before turning back
    }
};

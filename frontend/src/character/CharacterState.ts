export const CharacterState = {
    IDLE: 'IDLE',
    WORKING: 'WORKING',
    NOTICE_USER: 'NOTICE_USER',
    WALKING_TO_USER: 'WALKING_TO_USER',
    ARRIVING: 'ARRIVING',
    FACE_USER: 'FACE_USER',
    INTRODUCING: 'INTRODUCING',
    LISTENING: 'LISTENING',
    THINKING: 'THINKING',
    SPEAKING: 'SPEAKING',
    GOODBYE: 'GOODBYE',
    WALKING_BACK: 'WALKING_BACK',
    RETURNING_TO_WORK: 'RETURNING_TO_WORK',
} as const;


export type CharacterState = typeof CharacterState[keyof typeof CharacterState];

import { CharacterState } from './CharacterState';

export type StateChangeCallback = (fromState: CharacterState, toState: CharacterState) => void;

export class CharacterStateMachine {
    private currentState: CharacterState = CharacterState.WORKING;
    private previousState: CharacterState = CharacterState.WORKING;
    private stateTime: number = 0;
    private listeners: StateChangeCallback[] = [];

    constructor(initialState: CharacterState = CharacterState.WORKING) {
        this.currentState = initialState;
        this.previousState = initialState;
    }

    public getState(): CharacterState {
        return this.currentState;
    }

    public getPreviousState(): CharacterState {
        return this.previousState;
    }

    public getStateTime(): number {
        return this.stateTime;
    }

    public addListener(callback: StateChangeCallback): void {
        this.listeners.push(callback);
    }

    public removeListener(callback: StateChangeCallback): void {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    public setState(newState: CharacterState): boolean {
        if (this.currentState === newState) {
            return false;
        }

        const oldState = this.currentState;
        this.previousState = oldState;
        this.currentState = newState;
        this.stateTime = 0;

        console.log(`[CharacterStateMachine] State changed: ${oldState} -> ${newState}`);

        for (const listener of this.listeners) {
            try {
                listener(oldState, newState);
            } catch (err) {
                console.error('[CharacterStateMachine] Listener error:', err);
            }
        }

        return true;
    }

    public update(delta: number): void {
        this.stateTime += delta;
    }
}

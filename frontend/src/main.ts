import './style.css';
import { SceneManager } from './scene/SceneManager';

const init = async () => {
    const container = document.getElementById('app');
    if (!container) return;

    try {
        const sceneManager = new SceneManager(container);
        await sceneManager.init();
    } catch (error) {
        console.error('Failed to initialize scene:', error);
        const errorOverlay = document.getElementById('error-overlay');
        if (errorOverlay) {
            errorOverlay.style.display = 'flex';
            errorOverlay.innerText = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
};

init();

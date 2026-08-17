import { AvatarController } from '../avatar/controllers/AvatarController';
import { CharacterController } from '../character/CharacterController';
import { CharacterState } from '../character/CharacterState';
import { NeuroSyncController } from '../avatar/controllers/NeuroSyncController';

export class PipelineClient {
    private ws: WebSocket | null = null;
    private audioCtx: AudioContext;
    private analyser: AnalyserNode;
    private nextStartTime: number = 0;
    
    private avatarController: AvatarController;
    private characterController: CharacterController | null = null;
    public neuroSyncController: NeuroSyncController;

    private isStreamingMic: boolean = false;
    private isMicPreprimed: boolean = false;
    private micStream: MediaStream | null = null;
    private micProcessor: ScriptProcessorNode | null = null;
    private micSource: MediaStreamAudioSourceNode | null = null;
    private micAudioCtx: AudioContext | null = null;

    private activeSessionId: string = '';
    private isAudioPlaying: boolean = false;
    private isServerTTSStreaming: boolean = false;
    private audioQueueCount: number = 0;
    private speechEndTimeout: any = null;

    // VAD & Termination Guards
    private isEnding: boolean = false;
    private isSessionClosed: boolean = false;
    private userHasSpoken: boolean = false;
    private silenceTimer: number = 0;
    private silenceTimeout: number = 1.2; // 1.2s pause tolerance for natural speech
    private isTurnProcessing: boolean = false;
    private hasIntroduced: boolean = false;
    private eosSentForCurrentUtterance: boolean = false;
    private chunkSequenceNumber: number = 0;
    private introFallbackTimer: any = null;

    // UI Elements
    private hudContainer: HTMLDivElement | null = null;
    private statusBadge: HTMLSpanElement | null = null;
    private talkBtn: HTMLButtonElement | null = null;
    private endBtn: HTMLButtonElement | null = null;
    private micTurnBtn: HTMLButtonElement | null = null;
    private testSelect: HTMLSelectElement | null = null;
    private testRunBtn: HTMLButtonElement | null = null;
    private transcriptContent: HTMLDivElement | null = null;
    private partialSubtitleDiv: HTMLDivElement | null = null;
    private metricsSpan: HTMLSpanElement | null = null;
    private profilerOverlay: HTMLDivElement | null = null;

    constructor(avatarController: AvatarController) {
        this.avatarController = avatarController;
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.3;
        this.analyser.connect(this.audioCtx.destination);

        this.neuroSyncController = new NeuroSyncController();
        this.createModernUI();
    }

    public setCharacterController(controller: CharacterController) {
        this.characterController = controller;
        this.characterController.stateMachine.addListener((_from, to) => {
            console.log(`[STATE] ${to}`);
            this.updateStatusBadge(to);
            this.avatarController.setCharacterState(to);

            if (to === CharacterState.WALKING_TO_USER || to === CharacterState.ARRIVING || to === CharacterState.INTRODUCING) {
                // Pre-prime microphone and WebSocket connection early so zero milliseconds are dropped
                this.preprimeMicrophone().catch(err => console.debug('Preprime mic notice:', err));
            }

            if (to === CharacterState.INTRODUCING) {
                if (!this.hasIntroduced && !this.isEnding) {
                    this.hasIntroduced = true;
                    this.startIntroduction();
                }
            } else if (to === CharacterState.LISTENING) {
                if (!this.isEnding && !this.isSessionClosed) {
                    this.isTurnProcessing = false;
                    this.userHasSpoken = false;
                    this.eosSentForCurrentUtterance = false;
                    this.silenceTimer = 0;
                    this.startMic();
                    if (this.micTurnBtn) {
                        this.micTurnBtn.style.display = 'inline-block';
                        this.micTurnBtn.innerText = '🎙️ Listening... (Speak naturally)';
                        this.micTurnBtn.classList.remove('btn-sending');
                    }
                }
            } else if (to === CharacterState.THINKING || to === CharacterState.SPEAKING) {
                if (this.micTurnBtn) {
                    if (to === CharacterState.THINKING) {
                        this.micTurnBtn.style.display = 'inline-block';
                        this.micTurnBtn.innerText = '⏳ Thinking...';
                        this.micTurnBtn.classList.add('btn-sending');
                    } else {
                        this.micTurnBtn.style.display = 'none';
                    }
                }
            } else if (to === CharacterState.WORKING) {
                this.isEnding = false;
                this.isSessionClosed = true;
                this.neuroSyncController.reset();
                if (this.talkBtn) this.talkBtn.style.display = 'inline-block';
                if (this.endBtn) this.endBtn.style.display = 'none';
                if (this.micTurnBtn) this.micTurnBtn.style.display = 'none';
            }
        });
    }

    private createModernUI() {
        // 1. Top Luxury Header Bar (Brand Identity & Realtime Hub)
        const topBar = document.createElement('div');
        topBar.className = 'uae-top-bar';
        topBar.innerHTML = `
            <div class="uae-brand-card">
                <span class="uae-logo-star">✦</span>
                <div class="uae-brand-text">
                    <span class="uae-brand-title">ALICIA</span>
                    <span class="uae-brand-sub">AI Executive Receptionist • Dubai DIFC</span>
                </div>
            </div>
            <div class="uae-status-hub">
                <div class="uae-telemetry-pill">
                    <span class="live-green-dot"></span>
                    <span>ONLINE</span>
                </div>
                <div class="uae-telemetry-pill" style="font-family: var(--font-mono); font-size: 10px;">
                    <span style="color: var(--text-gold);">WS:</span> 8000
                </div>
            </div>
        `;
        document.body.appendChild(topBar);

        // 2. Main Executive Conversation Glass HUD
        this.hudContainer = document.createElement('div');
        this.hudContainer.className = 'digital-human-hud';
        this.hudContainer.innerHTML = `
            <div class="hud-header">
                <div class="hud-title">
                    <span class="live-dot"></span>
                    <span class="hud-name">EXECUTIVE RECEPTION</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div id="character-status" class="status-pill status-working">READY</div>
                    <button id="btn-minimize-hud" class="hud-minimize-btn" title="Toggle Compact View">⚊</button>
                </div>
            </div>

            <div class="hud-actions">
                <button id="btn-talk" class="hud-btn btn-primary">
                    <span class="btn-icon">💬</span> Talk to Alicia
                </button>
                <button id="btn-mic-turn" class="hud-btn btn-action" style="display: none;">
                    🎙️ Listening... (Speak naturally)
                </button>
                <button id="btn-end" class="hud-btn btn-danger" style="display: none;">
                    👋 End Conversation
                </button>
            </div>

            <div class="hud-test-panel" style="display: flex; gap: 8px; align-items: center; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(212,175,55,0.12);">
                <select id="neurosync-test-select" style="flex: 1; background: #0f172a; color: #f8fafc; border: 1px solid rgba(212,175,55,0.25); border-radius: 8px; padding: 6px 10px; font-size: 11px; outline: none;">
                    <option value="A">Test A: Hello, my name is Alicia.</option>
                    <option value="B">Test B: Please tell me what you think about artificial intelligence.</option>
                    <option value="C">Test C: Peter picked a purple paper plane.</option>
                    <option value="D">Test D: Welcome to Dubai Corporate Headquarters.</option>
                    <option value="E">Test E: How may I assist your executive meeting today?</option>
                    <option value="F">Test F: Goodbye, have a wonderful evening.</option>
                </select>
                <button id="btn-run-test" class="hud-btn btn-action" style="flex: 0 0 auto; padding: 6px 14px; font-size: 11.5px;">
                    ▶️ Test
                </button>
            </div>

            <div class="hud-subtitles-box">
                <div class="subtitles-header">
                    <span>Live Conversation</span>
                    <span style="font-size: 9.5px; opacity: 0.7;">DUBAI DIFC SUITE</span>
                </div>
                <div id="transcript-content" class="subtitles-content">
                    <p class="subtitle-hint">Click "Talk to Alicia" to start your conversation with the executive receptionist.</p>
                </div>
            </div>

            <div class="uae-control-toolbar">
                <button id="btn-reset-camera" class="toolbar-btn">🎯 Reset View</button>
                <button id="btn-reconnect" class="toolbar-btn">🔄 Reconnect</button>
                <button id="btn-toggle-profiler" class="toolbar-btn">⏱️ Latency HUD</button>
            </div>

            <div class="hud-footer" style="display: flex; justify-content: space-between; align-items: center;">
                <span id="pipeline-metrics">ManySphere Exo • Kokoro-82M • NeuroSync</span>
                <span style="color: var(--text-gold); font-size: 10px;">UAE EXECUTIVE V2</span>
            </div>
        `;
        document.body.appendChild(this.hudContainer);

        // Developer Latency HUD Overlay
        this.profilerOverlay = document.createElement('div');
        this.profilerOverlay.id = 'profiler-hud';
        this.profilerOverlay.className = 'profiler-overlay';
        this.profilerOverlay.style.cssText = 'display: none; position: fixed; top: 20px; right: 20px; background: rgba(11, 17, 32, 0.94); border: 1px solid #d4af37; border-radius: 14px; padding: 16px 20px; font-family: monospace; font-size: 13px; color: #f8fafc; z-index: 99999; box-shadow: 0 12px 36px rgba(0,0,0,0.7), 0 0 20px rgba(212,175,55,0.2); min-width: 250px; backdrop-filter: blur(16px);';
        this.profilerOverlay.innerHTML = `
            <div style="font-weight: 700; color: #d4af37; margin-bottom: 10px; border-bottom: 1px solid rgba(212,175,55,0.25); padding-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span>⚡ LATENCY PROFILER</span>
                <span id="prof-turn-badge" style="font-size: 11px; color: #94a3b8;">TURN 00000</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr auto; row-gap: 6px; column-gap: 16px;">
                <span style="color: #94a3b8;">ASR</span><span id="prof-asr" style="font-weight: 600; color: #f8fafc;">0 ms</span>
                <span style="color: #94a3b8;">LLM TTFT</span><span id="prof-llm-ttft" style="font-weight: 600; color: #f8fafc;">0 ms</span>
                <span style="color: #94a3b8;">LLM TPS</span><span id="prof-llm-tps" style="font-weight: 600; color: #34d399;">0.0 tok/s</span>
                <span style="color: #94a3b8;">TTS TTFA</span><span id="prof-tts-ttfa" style="font-weight: 600; color: #f8fafc;">0 ms</span>
                <span style="color: #94a3b8;">Playback</span><span id="prof-playback" style="font-weight: 600; color: #f8fafc;">0 ms</span>
                <span style="color: #94a3b8;">Lip Sync</span><span id="prof-lip" style="font-weight: 600; color: #f8fafc;">0 ms</span>
                <div style="grid-column: span 2; border-top: 1px solid rgba(212,175,55,0.2); margin: 6px 0;"></div>
                <span style="color: #d4af37; font-weight: 700;">TOTAL</span><span id="prof-total" style="font-weight: 700; color: #fef08a;">0 ms</span>
            </div>
        `;
        document.body.appendChild(this.profilerOverlay);

        this.statusBadge = this.hudContainer.querySelector('#character-status');
        this.talkBtn = this.hudContainer.querySelector('#btn-talk');
        this.endBtn = this.hudContainer.querySelector('#btn-end');
        this.micTurnBtn = this.hudContainer.querySelector('#btn-mic-turn');
        this.testSelect = this.hudContainer.querySelector('#neurosync-test-select');
        this.testRunBtn = this.hudContainer.querySelector('#btn-run-test');
        this.transcriptContent = this.hudContainer.querySelector('#transcript-content');
        this.metricsSpan = this.hudContainer.querySelector('#pipeline-metrics');
        const toggleProfilerBtn = this.hudContainer.querySelector('#btn-toggle-profiler') as HTMLButtonElement | null;
        const reconnectBtn = this.hudContainer.querySelector('#btn-reconnect') as HTMLButtonElement | null;
        const resetCameraBtn = this.hudContainer.querySelector('#btn-reset-camera') as HTMLButtonElement | null;
        const minimizeBtn = this.hudContainer.querySelector('#btn-minimize-hud') as HTMLButtonElement | null;

        if (minimizeBtn) {
            let isMin = false;
            minimizeBtn.onclick = () => {
                isMin = !isMin;
                if (this.hudContainer) {
                    this.hudContainer.classList.toggle('minimized', isMin);
                    minimizeBtn.innerText = isMin ? '⛶' : '⚊';
                    minimizeBtn.title = isMin ? 'Expand Panel' : 'Minimize Panel';
                }
            };
        }

        if (toggleProfilerBtn) {
            toggleProfilerBtn.onclick = () => this.toggleProfilerOverlay();
        }

        if (reconnectBtn) {
            reconnectBtn.onclick = () => {
                this.connectWebSocket();
                this.logMessage('system', 'Reconnecting to Dubai Reception Gateway...');
            };
        }

        if (resetCameraBtn) {
            resetCameraBtn.onclick = () => {
                const cameraEngine = (window as any).__cameraEngine;
                if (cameraEngine) {
                    cameraEngine.resetView();
                }
                const controls = (window as any).__controls;
                if (controls && cameraEngine) {
                    controls.target.copy(cameraEngine.baseTarget);
                    controls.update();
                }
            };
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'p' || e.key === 'P' || e.key === '`') {
                this.toggleProfilerOverlay();
            }
        });

        if (this.talkBtn) {
            this.talkBtn.onclick = () => this.handleTalkClicked();
        }
        if (this.endBtn) {
            this.endBtn.onclick = () => this.endConversation();
        }
        if (this.micTurnBtn) {
            this.micTurnBtn.onclick = () => this.handleSendTurn();
        }
        if (this.testRunBtn) {
            this.testRunBtn.onclick = () => this.handleRunTestSentence();
        }
    }

    private toggleProfilerOverlay() {
        if (!this.profilerOverlay) return;
        this.profilerOverlay.style.display = this.profilerOverlay.style.display === 'none' ? 'block' : 'none';
    }

    private updateStatusBadge(state: CharacterState) {
        if (!this.statusBadge) return;
        this.statusBadge.innerText = state.replace(/_/g, ' ');
        this.statusBadge.className = `status-pill status-${state.toLowerCase()}`;

        const cameraEngine = (window as any).__cameraEngine;
        if (cameraEngine) {
            if (state === CharacterState.SPEAKING) {
                cameraEngine.setState('SPEAKING');
            } else if (state === CharacterState.LISTENING) {
                cameraEngine.setState('LISTENING');
            } else {
                cameraEngine.setState('IDLE');
            }
        }
    }

    private logMessage(speaker: 'user' | 'assistant' | 'system', text: string) {
        if (!this.transcriptContent) return;
        
        const hint = this.transcriptContent.querySelector('.subtitle-hint');
        if (hint) hint.remove();

        if (this.partialSubtitleDiv) {
            this.partialSubtitleDiv.remove();
            this.partialSubtitleDiv = null;
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `msg-entry msg-${speaker}`;
        
        const label = speaker === 'user' ? 'You' : speaker === 'assistant' ? 'Alicia' : 'System';
        msgDiv.innerHTML = `<span class="msg-label">${label}:</span> <span class="msg-text">${text}</span>`;
        
        this.transcriptContent.appendChild(msgDiv);
        this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
    }

    private updatePartialPreview(partialText: string) {
        if (!this.transcriptContent) return;
        if (!this.partialSubtitleDiv) {
            this.partialSubtitleDiv = document.createElement('div');
            this.partialSubtitleDiv.className = 'msg-entry msg-user msg-partial';
            this.partialSubtitleDiv.style.opacity = '0.7';
            this.partialSubtitleDiv.style.fontStyle = 'italic';
            this.transcriptContent.appendChild(this.partialSubtitleDiv);
        }
        this.partialSubtitleDiv.innerHTML = `<span class="msg-label">You:</span> <span class="msg-text">${partialText}...</span>`;
        this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
    }

    private updateLastAssistantMessage(chunk: string) {
        if (!this.transcriptContent) return;
        const lastEntry = this.transcriptContent.querySelector('.msg-assistant:last-child');
        if (lastEntry) {
            const textSpan = lastEntry.querySelector('.msg-text');
            if (textSpan) {
                textSpan.textContent = (textSpan.textContent || '') + chunk;
                this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
                return;
            }
        }
        this.logMessage('assistant', chunk);
    }

    private async handleTalkClicked() {
        if (!this.characterController) return;

        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        this.isEnding = false;
        this.isSessionClosed = false;
        this.hasIntroduced = false;
        this.activeSessionId = `session-${Date.now().toString(36)}`;
        
        if (this.talkBtn) this.talkBtn.style.display = 'none';
        if (this.endBtn) this.endBtn.style.display = 'inline-block';

        this.logMessage('system', 'Calling Alicia...');
        this.characterController.callToUser();
    }

    private async handleRunTestSentence() {
        if (!this.testSelect) return;
        const key = this.testSelect.value;
        const sentences: Record<string, string> = {
            'A': 'Hello, my name is Alicia.',
            'B': 'Please tell me what you think about artificial intelligence.',
            'C': 'Peter picked a purple paper plane.',
            'D': 'Wow, I really love this beautiful world.',
            'E': 'She sells shiny shoes.',
            'F': 'Go away.'
        };
        const text = sentences[key] || sentences['A'];

        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        if (!this.activeSessionId) {
            this.activeSessionId = `session-${Date.now().toString(36)}`;
        }

        await this.connectWebSocket();
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.logMessage('system', `Running NeuroSync Test ${key}: "${text}"`);
            this.ws.send(JSON.stringify({
                action: 'text',
                text: text
            }));
        }
    }

    public endConversation(): void {
        if (this.isEnding || this.isSessionClosed) {
            return;
        }

        this.isEnding = true;
        console.log('[MIC] STOPPED');
        this.stopMicAuthoritative();

        if (this.endBtn) this.endBtn.style.display = 'none';
        if (this.micTurnBtn) this.micTurnBtn.style.display = 'none';

        this.logMessage('system', 'Ending conversation. Saving transcript...');

        if (this.characterController) {
            this.characterController.stateMachine.setState(CharacterState.GOODBYE);
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('GOODBYE');
        }
    }

    private handleSendTurn() {
        if (this.isEnding || this.isSessionClosed) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.isTurnProcessing) return;

        this.isTurnProcessing = true;
        this.isServerTTSStreaming = true;
        this.isAudioPlaying = false;
        this.userHasSpoken = false;
        this.eosSentForCurrentUtterance = true;
        this.silenceTimer = 0;

        if (this.micTurnBtn) {
            this.micTurnBtn.innerText = '⏳ Processing voice...';
            this.micTurnBtn.classList.add('btn-sending');
        }

        console.log('[EOS] Sending end of utterance signal');
        this.ws.send('EOS');
        if (this.characterController) {
            this.characterController.stateMachine.setState(CharacterState.THINKING);
        }
    }

    private async connectWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            const wsUrl = `ws://localhost:8000/ws/asr?session_id=${encodeURIComponent(this.activeSessionId)}`;
            try {
                this.ws = new WebSocket(wsUrl);
            } catch (createErr) {
                this.hasIntroduced = false;
                reject(createErr);
                return;
            }

            this.ws.onopen = () => {
                console.log('[ASR WS] OPEN - session:', this.activeSessionId);
                resolve();
            };

            this.ws.onerror = (err) => {
                console.error('[PipelineClient] WebSocket error:', err);
                this.hasIntroduced = false;
                this.logMessage('system', 'Connection to backend error. Ensure backend is running.');
                reject(err);
            };

            this.ws.onclose = () => {
                console.log('[PipelineClient] WebSocket closed.');
                this.stopMicAuthoritative();
            };

            this.ws.onmessage = (event) => {
                this.handlePacket(event.data);
            };
        });
    }

    private async startIntroduction() {
        if (this.isEnding) return;
        this.isServerTTSStreaming = true;
        this.isTurnProcessing = true;
        this.isAudioPlaying = false;
        this.userHasSpoken = false;
        this.silenceTimer = 0;
        
        // Safety timeout: If audio never arrives within 5.0 seconds, gracefully recover to LISTENING
        clearTimeout(this.introFallbackTimer);
        this.introFallbackTimer = setTimeout(() => {
            if (this.characterController && this.characterController.getState() === CharacterState.INTRODUCING) {
                console.warn('[INTRODUCE] Safety timeout reached without audio — advancing to LISTENING');
                this.characterController.stateMachine.setState(CharacterState.LISTENING);
            }
        }, 5000);

        try {
            await this.connectWebSocket();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                console.log('[INTRODUCE] Triggering initial greeting');
                this.ws.send('INTRODUCE');
            } else {
                this.hasIntroduced = false;
            }
        } catch (err) {
            console.error('Failed to start introduction:', err);
            this.hasIntroduced = false;
        }
    }

    private handlePacket(rawData: string) {
        try {
            const packet = JSON.parse(rawData);
            const { packet_type, payload, is_final } = packet;

            if (this.isEnding && packet_type !== 'tts') {
                return;
            }

            if (packet_type === 'asr') {
                if (payload) {
                    if (is_final) {
                        console.log(`[ASR FINAL] ${payload}`);
                        this.logMessage('user', payload);
                        if (this.characterController && !this.isEnding) {
                            this.characterController.stateMachine.setState(CharacterState.THINKING);
                        }
                    } else {
                        this.updatePartialPreview(payload);
                    }
                }
            } else if (packet_type === 'llm') {
                if (payload) {
                    this.updateLastAssistantMessage(payload);
                }
            } else if (packet_type === 'tts') {
                if (payload) {
                    this.isServerTTSStreaming = true;
                    this.isAudioPlaying = true;
                    this.isTurnProcessing = false;
                    this.userHasSpoken = false;
                    this.silenceTimer = 0;

                    if (this.isEnding || this.characterController?.getState() === CharacterState.GOODBYE) {
                        console.log('[TTS START] GOODBYE');
                    } else {
                        if (this.characterController && this.characterController.getState() !== CharacterState.SPEAKING) {
                            this.characterController.stateMachine.setState(CharacterState.SPEAKING);
                        }
                    }
                    this.handleTTSChunk(payload);
                }
                if (is_final) {
                    this.isServerTTSStreaming = false;
                    this.checkSpeechEnd();
                }
            } else if (packet_type === 'animation') {
                if (payload && Array.isArray(payload) && payload.length > 0) {
                    const scheduledTime = this.nextStartTime > this.audioCtx.currentTime ? this.nextStartTime : this.audioCtx.currentTime;
                    this.neuroSyncController.ingestRemoteNeuralFrames(payload, scheduledTime);
                }
            } else if (packet_type === 'system') {
                if (packet.payload && packet.payload.status === 'no_speech') {
                    console.log('[ASR] No speech recognized in turn');
                    this.isTurnProcessing = false;
                    this.isServerTTSStreaming = false;
                    this.userHasSpoken = false;
                    this.eosSentForCurrentUtterance = false;
                    this.silenceTimer = 0;
                    if (this.characterController && !this.isEnding) {
                        this.characterController.stateMachine.setState(CharacterState.LISTENING);
                    }
                    if (this.micTurnBtn) {
                        this.micTurnBtn.innerText = '🎙️ Listening... (Speak naturally)';
                        this.micTurnBtn.classList.remove('btn-sending');
                    }
                } else if (packet.payload && packet.payload.status === 'complete') {
                    this.isServerTTSStreaming = false;
                    this.isTurnProcessing = false;
                    this.checkSpeechEnd();

                    const meta = packet.payload;
                    if (this.metricsSpan && meta.llm_ttft_ms !== undefined) {
                        const ttft = meta.llm_ttft_ms ? `${meta.llm_ttft_ms.toFixed(0)}ms` : '0ms';
                        const ttfa = meta.tts_ttfa_ms ? `${meta.tts_ttfa_ms.toFixed(0)}ms` : '0ms';
                        const turnLat = meta.turn_to_speech_latency_ms ? `${meta.turn_to_speech_latency_ms.toFixed(0)}ms` : '0ms';
                        this.metricsSpan.innerText = `LLM TTFT: ${ttft} • TTS TTFA: ${ttfa} • Turn-to-Audio: ${turnLat} • Total: ${meta.duration_ms.toFixed(0)}ms`;
                    }

                    // Update Developer Latency HUD Overlay
                    if (this.profilerOverlay) {
                        const turnBadge = this.profilerOverlay.querySelector('#prof-turn-badge');
                        const asrSpan = this.profilerOverlay.querySelector('#prof-asr');
                        const ttftSpan = this.profilerOverlay.querySelector('#prof-llm-ttft');
                        const tpsSpan = this.profilerOverlay.querySelector('#prof-llm-tps');
                        const ttfaSpan = this.profilerOverlay.querySelector('#prof-tts-ttfa');
                        const playbackSpan = this.profilerOverlay.querySelector('#prof-playback');
                        const lipSpan = this.profilerOverlay.querySelector('#prof-lip');
                        const totalSpan = this.profilerOverlay.querySelector('#prof-total');

                        if (turnBadge) turnBadge.textContent = `TURN ${meta.turn_id || '00000'}`;
                        if (asrSpan) asrSpan.textContent = `${(meta.asr_latency_ms || 0).toFixed(0)} ms`;
                        if (ttftSpan) ttftSpan.textContent = `${(meta.llm_ttft_ms || 0).toFixed(0)} ms`;
                        if (tpsSpan) tpsSpan.textContent = `${(meta.llm_tps || 0).toFixed(1)} tok/s`;
                        if (ttfaSpan) ttfaSpan.textContent = `${(meta.tts_ttfa_ms || 0).toFixed(0)} ms`;
                        if (playbackSpan) playbackSpan.textContent = `${(meta.playback_delay_ms || 18).toFixed(0)} ms`;
                        if (lipSpan) lipSpan.textContent = `${(meta.lip_delay_ms || 4).toFixed(0)} ms`;
                        if (totalSpan) totalSpan.textContent = `${(meta.duration_ms || 0).toFixed(0)} ms`;
                    }
                }
            }
        } catch (err) {
            console.error('Error handling packet:', err);
        }
    }

    private checkSpeechEnd() {
        if (this.audioQueueCount <= 0 && !this.isServerTTSStreaming) {
            this.audioQueueCount = 0;
            const remainingTime = Math.max(0, this.nextStartTime - this.audioCtx.currentTime);
            const delayMs = Math.max(250, remainingTime * 1000 + 250);

            clearTimeout(this.speechEndTimeout);
            this.speechEndTimeout = setTimeout(() => {
                if (this.audioQueueCount <= 0 && !this.isServerTTSStreaming && this.audioCtx.currentTime >= this.nextStartTime - 0.05) {
                    this.isAudioPlaying = false;
                    this.isTurnProcessing = false;
                    this.userHasSpoken = false;
                    this.eosSentForCurrentUtterance = false;
                    this.silenceTimer = 0;

                    if (this.isEnding || this.characterController?.getState() === CharacterState.GOODBYE) {
                        console.log('[TTS COMPLETE] GOODBYE');
                        console.log('[SESSION] STOPPED');
                        
                        try {
                            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                                this.ws.close();
                            }
                        } catch {}
                        
                        this.isSessionClosed = true;

                        if (this.characterController) {
                            this.characterController.startWalkingBack();
                        }
                        return;
                    }

                    console.log('[TTS COMPLETE]');

                    if (!this.isEnding && this.characterController) {
                        const currState = this.characterController.getState();
                        if (currState === CharacterState.SPEAKING || currState === CharacterState.INTRODUCING) {
                            console.log('[MIC RESTART]');
                            this.characterController.stateMachine.setState(CharacterState.LISTENING);
                        }
                    }
                }
            }, delayMs);
        }
    }

    private handleTTSChunk(base64Payload: string) {
        if (base64Payload.startsWith('<audio bytes') || base64Payload === '') return;

        const chunkIndex = ++this.chunkSequenceNumber;
        const binaryString = atob(base64Payload);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const sampleRate = 24000; // Kokoro 24kHz standard
        const int16Array = new Int16Array(bytes.buffer);
        const audioBuffer = this.audioCtx.createBuffer(1, int16Array.length, sampleRate);
        const float32Data = audioBuffer.getChannelData(0);

        for (let i = 0; i < int16Array.length; i++) {
            float32Data[i] = int16Array[i] / 32768.0;
        }

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.analyser);

        const currentTime = this.audioCtx.currentTime;
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime + 0.002;
        }

        const scheduledStartTime = this.nextStartTime;

        // Cancel any pending fallback timer when audio arrives
        clearTimeout(this.introFallbackTimer);

        // Feed float32 waveform to NeuroSync timeline fallback
        this.neuroSyncController.processAudioBuffer(float32Data, sampleRate, scheduledStartTime);

        console.log(`[CHUNK #${chunkIndex}] Packet Received (${bytes.length} B) -> Decoded -> AudioBuffer Created (${audioBuffer.duration.toFixed(3)}s) -> Scheduled at ${scheduledStartTime.toFixed(3)}s -> Blendshapes Fed`);

        if (!this.isAudioPlaying) {
            const timeStr = new Date().toLocaleTimeString();
            console.log(`[FIRST AUDIO RECEIVED ${timeStr}]`);
            console.log(`[AUDIO PLAYBACK START ${timeStr}]`);
            if (this.isEnding || this.characterController?.getState() === CharacterState.GOODBYE) {
                console.log('[TTS START] GOODBYE');
            } else {
                console.log('[TTS START]');
            }
        }

        this.audioQueueCount++;
        this.isAudioPlaying = true;

        source.onended = () => {
            console.log(`[CHUNK #${chunkIndex}] Playback Finished`);
            this.audioQueueCount--;
            this.checkSpeechEnd();
        };

        source.start(scheduledStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    private async preprimeMicrophone() {
        if (this.isMicPreprimed || this.isEnding || this.isSessionClosed) return;
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            this.micAudioCtx = new AudioContext({ sampleRate: 16000 });
            if (this.micAudioCtx.state === 'suspended') {
                await this.micAudioCtx.resume();
            }

            this.micSource = this.micAudioCtx.createMediaStreamSource(this.micStream);
            this.micProcessor = this.micAudioCtx.createScriptProcessor(4096, 1, 1);
            this.isMicPreprimed = true;
            console.log('[MIC] PRE-PRIMED');

            await this.connectWebSocket();
        } catch (err) {
            console.warn('Microphone pre-priming:', err);
        }
    }

    private async startMic() {
        if (this.isStreamingMic || this.isEnding || this.isSessionClosed) return;

        try {
            if (!this.isMicPreprimed || !this.micStream || !this.micAudioCtx || !this.micProcessor || !this.micSource) {
                await this.preprimeMicrophone();
            }

            if (this.micAudioCtx && this.micAudioCtx.state === 'suspended') {
                await this.micAudioCtx.resume();
            }

            console.log('[MIC] READY');

            await this.connectWebSocket();
            console.log('[ASR WS] OPEN');

            if (this.micProcessor && this.micSource && this.micAudioCtx) {
                this.micProcessor.onaudioprocess = (e) => {
                    if (this.isEnding || this.isSessionClosed) return;
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                    
                    // STRICT AUDIO & PLAYBACK GATE: Never listen while avatar is speaking, introducing, thinking, or audio is queued
                    if (this.isAudioPlaying || this.isServerTTSStreaming || this.isTurnProcessing || this.audioQueueCount > 0) {
                        this.userHasSpoken = false;
                        this.silenceTimer = 0;
                        return;
                    }
                    if (this.audioCtx && this.audioCtx.currentTime < this.nextStartTime + 0.15) {
                        this.userHasSpoken = false;
                        this.silenceTimer = 0;
                        return;
                    }
                    if (this.characterController && this.characterController.getState() !== CharacterState.LISTENING) {
                        this.userHasSpoken = false;
                        this.silenceTimer = 0;
                        return;
                    }

                    const inputData = e.inputBuffer.getChannelData(0);

                    let sumSquares = 0;
                    for (let i = 0; i < inputData.length; i++) {
                        sumSquares += inputData[i] * inputData[i];
                    }
                    const rms = Math.sqrt(sumSquares / inputData.length);

                    if (rms > 0.02) {
                        if (!this.userHasSpoken) {
                            console.log('[VAD START]');
                            console.log('[ASR SPEECH START]');
                        }
                        this.userHasSpoken = true;
                        this.eosSentForCurrentUtterance = false;
                        this.silenceTimer = 0;
                    } else if (this.userHasSpoken) {
                        if (this.silenceTimer === 0) {
                            console.log('[EOS ARMED]');
                        }
                        this.silenceTimer += inputData.length / 16000;
                        if (this.silenceTimer >= this.silenceTimeout && !this.eosSentForCurrentUtterance) {
                            console.log('[TURN COMMIT]');
                            this.eosSentForCurrentUtterance = true;
                            this.handleSendTurn();
                            return;
                        }
                    }

                    const int16Data = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const s = Math.max(-1, Math.min(1, inputData[i]));
                        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }

                    this.ws.send(int16Data.buffer);
                };

                this.micSource.connect(this.micProcessor);
                this.micProcessor.connect(this.micAudioCtx.destination);
                this.isStreamingMic = true;
                console.log('[ASR] CAPTURE_STARTED');
            }
        } catch (err) {
            console.error('Failed to access microphone:', err);
            this.logMessage('system', 'Microphone permission error or unavailable.');
        }
    }

    private stopMicAuthoritative() {
        this.isStreamingMic = false;
        this.isMicPreprimed = false;
        this.userHasSpoken = false;
        this.eosSentForCurrentUtterance = false;
        this.silenceTimer = 0;

        if (this.micProcessor) {
            try { this.micProcessor.disconnect(); } catch {}
            this.micProcessor = null;
        }
        if (this.micSource) {
            try { this.micSource.disconnect(); } catch {}
            this.micSource = null;
        }
        if (this.micAudioCtx) {
            try { this.micAudioCtx.close(); } catch {}
            this.micAudioCtx = null;
        }
        if (this.micStream) {
            try {
                this.micStream.getTracks().forEach(t => t.stop());
            } catch {}
            this.micStream = null;
        }
    }

    private voiceFreqData = new Uint8Array(64);

    public getVoiceEnergy(): number {
        if (!this.isAudioPlaying || !this.analyser) return 0.0;
        try {
            this.analyser.getByteFrequencyData(this.voiceFreqData);
            let sum = 0;
            for (let i = 0; i < 32; i++) {
                sum += this.voiceFreqData[i];
            }
            return Math.min(1.0, (sum / 32) / 120.0);
        } catch {
            return 0.0;
        }
    }

    public update(delta: number) {
        const currentAudioTime = this.audioCtx.currentTime;
        const neuroSyncFrame = this.neuroSyncController.update(currentAudioTime, delta);
        this.avatarController.applyAnimationFrame(neuroSyncFrame);
    }
}

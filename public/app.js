class VoicebotApp {
    constructor() {
        this.socket = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isConnected = false;
        this.isMuted = false;
        this.recordingTimer = null;
        this.silenceTimer = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;

        this.initializeElements();
        this.initializeSocket();
        this.setupEventListeners();
        this.checkMicrophonePermission();
    }

    initializeElements() {
        this.voiceCallBtn = document.getElementById('voiceCallBtn');
        this.callIcon = document.getElementById('callIcon');
        this.btnText = document.getElementById('btnText');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.audioControls = document.getElementById('audioControls');
        this.muteBtn = document.getElementById('muteBtn');
        this.endCallBtn = document.getElementById('endCallBtn');
        this.conversationPanel = document.getElementById('conversationPanel');
        this.messages = document.getElementById('messages');
        this.transcription = document.getElementById('transcription');
        this.recordingIndicator = document.getElementById('recordingIndicator');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.audioPlayer = document.getElementById('audioPlayer');
    }

    initializeSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
            this.endCall();
        });

        this.socket.on('bot-message', (message) => {
            this.addMessage(message, 'bot');
        });

        this.socket.on('transcription', (text) => {
            this.updateTranscription(text);
            this.addMessage(text, 'user');
        });

        this.socket.on('audio-response', (audioBuffer) => {
            this.playAudioResponse(audioBuffer);
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError(error);
        });
    }

    setupEventListeners() {
        this.voiceCallBtn.addEventListener('click', () => {
            if (!this.isConnected) {
                this.startCall();
            } else {
                this.toggleRecording();
            }
        });

        this.muteBtn.addEventListener('click', () => {
            this.toggleMute();
        });

        this.endCallBtn.addEventListener('click', () => {
            this.endCall();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.isConnected) {
                e.preventDefault();
                if (!this.isRecording) {
                    this.startRecording();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isConnected && this.isRecording) {
                e.preventDefault();
                this.stopRecording();
            }
        });
    }

    async checkMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            console.log('Microphone permission granted');
        } catch (error) {
            console.error('Microphone permission denied:', error);
            this.showError('Microphone access is required for voice calls. Please enable microphone permission.');
        }
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        const statusText = document.querySelector('.status-text');

        if (connected) {
            this.statusIndicator.className = 'status-indicator online';
            statusText.textContent = 'Connected - Ready to assist';
        } else {
            this.statusIndicator.className = 'status-indicator offline';
            statusText.textContent = 'Connecting...';
        }
    }

    async startCall() {
        try {
            this.showLoading('Connecting to assistant...');

            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.setupAudioAnalysis(stream);
            this.hideLoading();

            // Update UI
            this.voiceCallBtn.classList.add('connected');
            this.callIcon.className = 'fas fa-microphone';
            this.btnText.textContent = 'Tap to Talk';
            this.audioControls.style.display = 'flex';
            this.conversationPanel.style.display = 'block';
            this.statusIndicator.className = 'status-indicator active';

            // Show initial bot message
            this.addMessage('Hello! Welcome to Sparkle Clean. I\'m here to help you book a cleaning service. May I start by getting your name?', 'bot');

            console.log('Call started successfully');

        } catch (error) {
            console.error('Error starting call:', error);
            this.hideLoading();
            this.showError('Failed to start call. Please check your microphone and try again.');
        }
    }

    setupAudioAnalysis(stream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);

        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    async startRecording() {
        if (this.isRecording || this.isMuted) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });

            // Try different audio formats for better compatibility
            let options = { mimeType: 'audio/wav' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'audio/webm' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options = { mimeType: 'audio/mp4' };
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        options = {}; // Use default
                    }
                }
            }

            this.mediaRecorder = new MediaRecorder(stream, options);
            console.log('🎵 Recording with format:', options.mimeType || 'default');

            this.audioChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };

            this.mediaRecorder.start(100); // Collect data every 100ms

            // Update UI
            this.voiceCallBtn.classList.add('calling');
            this.callIcon.className = 'fas fa-stop';
            this.btnText.textContent = 'Recording...';
            this.recordingIndicator.style.display = 'flex';
            this.transcription.textContent = 'Listening...';

            // Auto-stop recording after silence detection or max time
            this.setupSilenceDetection(stream);
            this.recordingTimer = setTimeout(() => {
                this.stopRecording();
            }, 10000); // Max 10 seconds

        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Failed to start recording. Please try again.');
        }
    }

    setupSilenceDetection(stream) {
        if (!this.audioContext || !this.analyser) {
            this.setupAudioAnalysis(stream);
        }

        const checkAudioLevel = () => {
            if (!this.isRecording) return;

            this.analyser.getByteFrequencyData(this.dataArray);
            const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;

            if (average < 10) { // Silence threshold
                if (!this.silenceTimer) {
                    this.silenceTimer = setTimeout(() => {
                        this.stopRecording();
                    }, 2000); // Stop after 2 seconds of silence
                }
            } else {
                if (this.silenceTimer) {
                    clearTimeout(this.silenceTimer);
                    this.silenceTimer = null;
                }
            }

            if (this.isRecording) {
                requestAnimationFrame(checkAudioLevel);
            }
        };

        checkAudioLevel();
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.recordingTimer) {
            clearTimeout(this.recordingTimer);
            this.recordingTimer = null;
        }

        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }

        // Stop all tracks
        if (this.mediaRecorder && this.mediaRecorder.stream) {
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        // Update UI
        this.voiceCallBtn.classList.remove('calling');
        this.callIcon.className = 'fas fa-microphone';
        this.btnText.textContent = 'Tap to Talk';
        this.recordingIndicator.style.display = 'none';
        this.transcription.textContent = 'Processing...';
    }

    async processRecording() {
        if (this.audioChunks.length === 0) {
            console.warn('⚠️ No audio chunks to process');
            this.transcription.textContent = 'No audio detected. Please try again.';
            return;
        }

        try {
            console.log('🎵 Processing', this.audioChunks.length, 'audio chunks');

            // Use the same MIME type that was used for recording
            const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });

            console.log('📦 Audio blob size:', audioBlob.size, 'bytes, type:', mimeType);

            if (audioBlob.size === 0) {
                console.warn('⚠️ Empty audio blob');
                this.transcription.textContent = 'No audio recorded. Please try again.';
                return;
            }

            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log('📤 Sending audio buffer to server, size:', arrayBuffer.byteLength);

            // Send audio data to server
            this.socket.emit('audio-data', arrayBuffer);

        } catch (error) {
            console.error('❌ Error processing recording:', error);
            this.showError('Failed to process audio. Please try again.');
        }

        this.audioChunks = [];
    }

    async playAudioResponse(audioBuffer) {
        try {
            const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(blob);

            this.audioPlayer.src = audioUrl;
            this.audioPlayer.play();

            // Clean up URL after playing
            this.audioPlayer.onended = () => {
                URL.revokeObjectURL(audioUrl);
            };

        } catch (error) {
            console.error('Error playing audio response:', error);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.isMuted) {
            this.muteBtn.classList.add('muted');
            this.muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            this.btnText.textContent = 'Muted';
        } else {
            this.muteBtn.classList.remove('muted');
            this.muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            this.btnText.textContent = 'Tap to Talk';
        }
    }

    endCall() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        // Clean up timers
        if (this.recordingTimer) {
            clearTimeout(this.recordingTimer);
            this.recordingTimer = null;
        }

        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Reset UI
        this.voiceCallBtn.classList.remove('connected', 'calling');
        this.callIcon.className = 'fas fa-phone';
        this.btnText.textContent = 'Start Voice Call';
        this.audioControls.style.display = 'none';
        this.conversationPanel.style.display = 'none';
        this.recordingIndicator.style.display = 'none';
        this.statusIndicator.className = 'status-indicator online';
        this.isMuted = false;
        this.muteBtn.classList.remove('muted');
        this.muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';

        // Clear messages
        this.messages.innerHTML = '';
        this.transcription.textContent = '';

        console.log('Call ended');
    }

    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;

        this.messages.appendChild(messageDiv);
        this.messages.scrollTop = this.messages.scrollHeight;
    }

    updateTranscription(text) {
        this.transcription.textContent = `You said: "${text}"`;
    }

    showLoading(message = 'Loading...') {
        this.loadingOverlay.style.display = 'flex';
        const loadingText = this.loadingOverlay.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }

    showError(message) {
        // Create error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-notification';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #ef5350, #f44336);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 10px 20px rgba(244, 67, 54, 0.3);
            z-index: 1001;
            max-width: 300px;
            animation: slideInRight 0.3s ease;
        `;
        errorDiv.textContent = message;

        document.body.appendChild(errorDiv);

        // Remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }
}

// Add CSS for error notification animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.voicebotApp = new VoicebotApp();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.voicebotApp && window.voicebotApp.isRecording) {
        window.voicebotApp.stopRecording();
    }
});

// Handle beforeunload to clean up
window.addEventListener('beforeunload', () => {
    if (window.voicebotApp) {
        window.voicebotApp.endCall();
    }
});
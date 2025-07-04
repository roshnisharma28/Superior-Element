class VoicebotApp {
  constructor() {
    this.socket = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isConnected = false;
    this.isMuted = false;
    this.inCall = false;
    this.botSpeaking = false;
    this.recordingTimer = null;
    this.silenceTimer = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.voiceEnabled = true;
    
    // Keep streaming optimizations but simpler
    this.streamingAudioChunks = [];
    this.isPlayingAudio = false;

    this.initializeElements();
    this.initializeSocket();
    this.setupEventListeners();
    this.checkMicrophonePermission();
  }

  initializeElements() {
    this.voiceCallBtn = document.getElementById("voiceCallBtn");
    this.callIcon = document.getElementById("callIcon");
    this.btnText = document.getElementById("btnText");
    this.statusIndicator = document.getElementById("statusIndicator");
    this.audioControls = document.getElementById("audioControls");
    this.muteBtn = document.getElementById("muteBtn");
    this.endCallBtn = document.getElementById("endCallBtn");
    this.conversationPanel = document.getElementById("conversationPanel");
    this.messages = document.getElementById("messages");
    this.transcription = document.getElementById("transcription");
    this.recordingIndicator = document.getElementById("recordingIndicator");
    this.loadingOverlay = document.getElementById("loadingOverlay");
    this.audioPlayer = document.getElementById("audioPlayer");
  }

  initializeSocket() {
    this.socket = io();

    this.socket.on("connect", () => {
      console.log("Connected to server");
      this.updateConnectionStatus(true);
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      this.updateConnectionStatus(false);
      this.endCall();
    });

    this.socket.on("bot-message", (message) => {
      this.addMessage(message, "bot");
    });

    // Handle streaming text chunks (NEW)
    this.socket.on("bot-message-chunk", (chunk) => {
      this.handleStreamingText(chunk);
    });

    this.socket.on("transcription", (text) => {
      this.updateTranscription(text);
      this.addMessage(text, "user");
    });

    // Handle streaming audio response (NEW)
    this.socket.on("audio-chunk", (audioBuffer) => {
      this.streamingAudioChunks.push(audioBuffer);
      if (!this.isPlayingAudio) {
        this.playStreamingAudio();
      }
    });

    this.socket.on("audio-stream-end", () => {
      console.log("� Audio stream ended");
    });

    this.socket.on("tts-error", (error) => {
      console.log("TTS Error:", error);
      this.voiceEnabled = false;
      this.resumeListening();
    });

    this.socket.on("error", (error) => {
      console.error("Socket error:", error);
      this.showError(error);
    });
  }

  setupEventListeners() {
    this.voiceCallBtn.addEventListener("click", () => {
      if (!this.inCall) {
        this.startCall();
      }
    });

    this.muteBtn.addEventListener("click", () => {
      this.toggleMute();
    });

    this.endCallBtn.addEventListener("click", () => {
      this.endCall();
    });
  }

  async checkMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      console.log("✅ Microphone permission granted");
    } catch (error) {
      console.error("❌ Microphone permission denied:", error);
      this.showError("Microphone access is required for voice calls. Please enable microphone permission.");
    }
  }

  updateConnectionStatus(connected) {
    this.isConnected = connected;
    const statusText = document.querySelector(".status-text");

    if (connected) {
      this.statusIndicator.className = "status-indicator online";
      statusText.textContent = "Ready to call";
    } else {
      this.statusIndicator.className = "status-indicator offline";
      statusText.textContent = "Connecting...";
    }
  }

  async startCall() {
    try {
      this.showLoading("Connecting call...");

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.setupAudioAnalysis(stream);
      this.hideLoading();

      // Update UI for call mode
      this.inCall = true;
      this.voiceCallBtn.classList.add("connected");
      this.callIcon.className = "fas fa-phone-alt";
      this.btnText.textContent = "Connected";
      this.audioControls.style.display = "flex";
      this.conversationPanel.style.display = "block";
      this.statusIndicator.className = "status-indicator active";
      this.recordingIndicator.style.display = "flex";

      console.log("📞 Call connected - continuous listening active");

      // Start continuous listening after 2 seconds
      setTimeout(() => {
        this.startContinuousListening();
      }, 2000);
    } catch (error) {
      console.error("Error starting call:", error);
      this.hideLoading();
      this.showError("Failed to start call. Please check your microphone and try again.");
    }
  }

  setupAudioAnalysis(stream) {
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);

    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  async startContinuousListening() {
    if (!this.inCall || this.isMuted || this.botSpeaking || this.isRecording)
      return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

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

      this.mediaRecorder.start(50);

      // Update UI
      this.transcription.textContent = "Listening...";

      // Simple 2-second silence detection like real calls
      this.setupCallSilenceDetection(stream);

      // Max 30 seconds per turn
      this.recordingTimer = setTimeout(() => {
        this.stopRecording();
      }, 30000);
    } catch (error) {
      console.error("Error starting listening:", error);
      // Retry in 2 seconds
      setTimeout(() => {
        if (this.inCall) this.startContinuousListening();
      }, 2000);
    }
  }

  setupCallSilenceDetection(stream) {
    if (!this.audioContext || !this.analyser) {
      this.setupAudioAnalysis(stream);
    }

    let speechDetected = false;
    let lastSpeechTime = Date.now();

    const checkAudioLevel = () => {
      if (!this.isRecording) return;

      this.analyser.getByteFrequencyData(this.dataArray);
      const average =
        this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;

      if (average > 12) {
        // Speech detected
        speechDetected = true;
        lastSpeechTime = Date.now();

        // Clear silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (speechDetected) {
        // Start 2-second silence timer after speech
        const silenceDuration = Date.now() - lastSpeechTime;

        if (silenceDuration > 1000 && !this.silenceTimer) {
          // 2 seconds of silence
          this.silenceTimer = setTimeout(() => {
            this.stopRecording();
          }, 100);
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

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
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
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }

    this.transcription.textContent = "Processing...";
  }

  async processRecording() {
    if (this.audioChunks.length === 0) {
      // No audio, restart listening
      this.resumeListening();
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Send audio data to server using NEW streaming method
      this.socket.emit("audio-data", arrayBuffer);
    } catch (error) {
      console.error("Error processing recording:", error);
      this.resumeListening();
    }

    this.audioChunks = [];
  }

  // Handle streaming text from LLM (NEW)
  handleStreamingText(chunk) {
    // Simply append streaming text to the conversation
    this.addMessage(chunk, "bot");
  }

  resumeListening() {
    if (this.inCall && !this.isMuted && !this.botSpeaking) {
      setTimeout(() => {
        this.startContinuousListening();
      }, 500);
    }
  }

  async playStreamingAudio() {
    if (this.isPlayingAudio || this.streamingAudioChunks.length === 0) return;
    
    this.isPlayingAudio = true;
    this.botSpeaking = true;

    try {
      // Combine all audio chunks
      const totalLength = this.streamingAudioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedAudio = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of this.streamingAudioChunks) {
        combinedAudio.set(new Uint8Array(chunk), offset);
        offset += chunk.length;
      }

      // Create audio blob and play
      const audioBlob = new Blob([combinedAudio], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      this.audioPlayer.src = audioUrl;
      await this.audioPlayer.play();

      this.audioPlayer.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.isPlayingAudio = false;
        this.botSpeaking = false;
        this.streamingAudioChunks = []; // Clear chunks
        
        console.log("🔊 Audio playback finished");
      };

    } catch (error) {
      console.error("Error playing streaming audio:", error);
      this.isPlayingAudio = false;
      this.botSpeaking = false;
      this.streamingAudioChunks = [];
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      this.muteBtn.classList.add("muted");
      this.muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
      this.transcription.textContent = "Muted";
      if (this.isRecording) {
        this.stopRecording();
      }
    } else {
      this.muteBtn.classList.remove("muted");
      this.muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
      this.resumeListening();
    }
  }

  endCall() {
    console.log("📞 Ending call...");

    // Stop recording
    if (this.isRecording) {
      this.stopRecording();
    }

    // Reset states
    this.inCall = false;
    this.botSpeaking = false;
    this.isPlayingAudio = false;

    // Clear audio buffers
    this.streamingAudioChunks = [];

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
    this.voiceCallBtn.classList.remove("connected");
    this.callIcon.className = "fas fa-phone";
    this.btnText.textContent = "Start Voice Call";
    this.audioControls.style.display = "none";
    this.conversationPanel.style.display = "none";
    this.recordingIndicator.style.display = "none";
    this.statusIndicator.className = "status-indicator online";
    this.isMuted = false;
    this.muteBtn.classList.remove("muted");
    this.muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';

    // Clear messages
    this.messages.innerHTML = "";
    this.transcription.textContent = "";
    this.voiceEnabled = true;

    console.log("📞 Call ended");
  }

  addMessage(text, type) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;

    this.messages.appendChild(messageDiv);
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  updateTranscription(text) {
    this.transcription.textContent = `You said: "${text}"`;
  }

  showLoading(message = "Loading...") {
    this.loadingOverlay.style.display = "flex";
    const loadingText = this.loadingOverlay.querySelector("p");
    if (loadingText) {
      loadingText.textContent = message;
    }
  }

  hideLoading() {
    this.loadingOverlay.style.display = "none";
  }

  showError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-notification";
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

    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, 5000);
  }
}

// CSS animations and streaming styles
const style = document.createElement("style");
style.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  .message.streaming {
    opacity: 0.8;
    border-left: 3px solid #4CAF50;
    animation: pulse 1s infinite;
  }
  
  @keyframes pulse {
    0% { opacity: 0.8; }
    50% { opacity: 1; }
    100% { opacity: 0.8; }
  }
  
  .message.bot {
    background: linear-gradient(45deg, #e3f2fd, #f3e5f5);
    border-radius: 18px 18px 5px 18px;
    margin-bottom: 8px;
    padding: 12px 16px;
    max-width: 80%;
    word-wrap: break-word;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  }
  
  .message.user {
    background: linear-gradient(45deg, #4CAF50, #45a049);
    color: white;
    border-radius: 18px 18px 18px 5px;
    margin-bottom: 8px;
    margin-left: auto;
    padding: 12px 16px;
    max-width: 80%;
    word-wrap: break-word;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  }
`;
document.head.appendChild(style);

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Initializing optimized VoicebotApp...");
  window.voicebotApp = new VoicebotApp();
});

// Handle page visibility changes
document.addEventListener("visibilitychange", () => {
  if (document.hidden && window.voicebotApp && window.voicebotApp.isRecording) {
    console.log("⏸️ Page hidden, pausing recording");
    window.voicebotApp.toggleMute();
  }
});

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  if (window.voicebotApp) {
    window.voicebotApp.endCall();
  }
});
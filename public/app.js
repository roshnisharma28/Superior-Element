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
    
    // Streaming optimizations
    this.isSTTReady = false;
    this.audioStream = null;
    this.streamingAudioChunks = [];
    this.currentAudioContext = null;
    this.audioQueue = [];
    this.isPlayingAudio = false;
    this.currentMessageDiv = null;
    this.messageBuffer = "";

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
      console.log("🔗 Connected to server");
      this.updateConnectionStatus(true);
    });

    this.socket.on("disconnect", () => {
      console.log("❌ Disconnected from server");
      this.updateConnectionStatus(false);
      this.endCall();
    });

    // Handle initial bot message
    this.socket.on("bot-message", (message) => {
      this.addMessage(message, "bot");
    });

    // Handle streaming text chunks
    this.socket.on("bot-message-chunk", (chunk) => {
      this.handleStreamingText(chunk);
    });

    // Handle live transcription
    this.socket.on("transcription", (text) => {
      this.updateTranscription(text);
      this.addMessage(text, "user");
    });

    // Handle streaming audio chunks
    this.socket.on("audio-chunk", (audioBuffer) => {
      this.handleAudioChunk(audioBuffer);
    });

    this.socket.on("audio-stream-end", () => {
      this.handleAudioStreamEnd();
    });

    // STT events
    this.socket.on("stt-ready", () => {
      console.log("🎤 STT ready for streaming");
      this.isSTTReady = true;
      this.transcription.textContent = "Listening...";
    });

    this.socket.on("utterance-end", () => {
      console.log("🔇 Utterance ended");
    });

    // Error handling
    this.socket.on("stt-error", (error) => {
      console.error("STT Error:", error);
      this.showError("Speech recognition error: " + error);
    });

    this.socket.on("llm-error", (error) => {
      console.error("LLM Error:", error);
      this.showError(error);
    });

    this.socket.on("tts-error", (error) => {
      console.log("TTS Error:", error);
      this.voiceEnabled = false;
    });

    this.socket.on("llm-complete", () => {
      console.log("✅ LLM response complete");
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
          sampleRate: 16000,
        },
      });

      this.audioStream = stream;
      this.setupAudioContext();
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

      console.log("📞 Call connected - starting live STT");

      // Start live STT stream
      this.socket.emit("start-audio-stream");
      
      // Start continuous audio streaming after STT is ready
      setTimeout(() => {
        this.startLiveAudioStream();
      }, 1000);
      
    } catch (error) {
      console.error("Error starting call:", error);
      this.hideLoading();
      this.showError("Failed to start call. Please check your microphone and try again.");
    }
  }

  setupAudioContext() {
    this.currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  async startLiveAudioStream() {
    if (!this.inCall || this.isMuted || !this.audioStream) return;

    try {
      // Create MediaRecorder for continuous streaming
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: "audio/webm;codecs=opus",
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.isSTTReady && !this.isMuted) {
          // Stream audio data directly to server
          const reader = new FileReader();
          reader.onload = () => {
            this.socket.emit("audio-stream", reader.result);
          };
          reader.readAsArrayBuffer(event.data);
        }
      };

      // Record in small chunks for real-time streaming
      this.mediaRecorder.start(100); // 100ms chunks
      this.isRecording = true;

      console.log("🎤 Live audio streaming started");

    } catch (error) {
      console.error("Error starting live audio stream:", error);
      this.showError("Failed to start audio streaming");
    }
  }

  // Handle streaming text from LLM
  handleStreamingText(chunk) {
    if (!this.currentMessageDiv) {
      // Create new message div for bot response
      this.currentMessageDiv = document.createElement("div");
      this.currentMessageDiv.className = "message bot streaming";
      this.messages.appendChild(this.currentMessageDiv);
      this.messageBuffer = "";
    }

    this.messageBuffer += " " + chunk;
    this.currentMessageDiv.textContent = this.messageBuffer.trim();
    this.messages.scrollTop = this.messages.scrollHeight;

    // Mark as complete when sentence ends
    setTimeout(() => {
      if (this.currentMessageDiv) {
        this.currentMessageDiv.classList.remove("streaming");
        this.currentMessageDiv = null;
      }
    }, 2000);
  }

  // Handle streaming audio chunks
  handleAudioChunk(audioBuffer) {
    if (!this.voiceEnabled) return;

    this.streamingAudioChunks.push(audioBuffer);
    
    // Start playing if not already playing
    if (!this.isPlayingAudio) {
      this.playStreamingAudio();
    }
  }

  handleAudioStreamEnd() {
    console.log("🔊 Audio stream ended");
    // The audio will finish playing naturally
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
      
      // Stop audio streaming
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.stop();
      }
    } else {
      this.muteBtn.classList.remove("muted");
      this.muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
      this.transcription.textContent = "Listening...";
      
      // Resume audio streaming
      this.startLiveAudioStream();
    }
  }

  endCall() {
    console.log("📞 Ending call...");

    // Stop live audio streaming
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop();
    }

    // Stop STT stream
    this.socket.emit("stop-audio-stream");

    // Stop audio stream
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }

    // Reset states
    this.inCall = false;
    this.botSpeaking = false;
    this.isRecording = false;
    this.isSTTReady = false;
    this.isPlayingAudio = false;

    // Clear audio buffers
    this.streamingAudioChunks = [];
    this.audioQueue = [];
    this.currentMessageDiv = null;
    this.messageBuffer = "";

    // Close audio context
    if (this.currentAudioContext) {
      this.currentAudioContext.close();
      this.currentAudioContext = null;
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

    console.log("📞 Call ended successfully");
  }

  addMessage(text, type) {
    // Don't add if it's part of streaming (handled separately)
    if (type === "bot" && this.currentMessageDiv) return;
    
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
class VoicebotApp {
  constructor() {
    this.socket = null;
    this.mediaRecorder = null;
    this.currentStream = null; // Track current stream
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

    this.socket.on("transcription", (text) => {
      this.updateTranscription(text);
      this.addMessage(text, "user");
    });

    this.socket.on("audio-response", (audioData) => {
      this.playAudioResponse(audioData);
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

    // Add debugging
    this.socket.on("audio-received", (info) => {
      console.log("Server confirmed audio received:", info);
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
      console.log("Microphone permission granted");
    } catch (error) {
      console.error("Microphone permission denied:", error);
      this.showError(
        "Microphone access is required for voice calls. Please enable microphone permission."
      );
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

      // Request microphone permission and setup audio context
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.setupAudioAnalysis(stream);
      stream.getTracks().forEach(track => track.stop()); // Stop test stream
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
      this.showError(
        "Failed to start call. Please check your microphone and try again."
      );
    }
  }

  setupAudioAnalysis(stream) {
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    
    // Only setup if we have a valid stream
    if (stream) {
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
    }

    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  async startContinuousListening() {
    if (!this.inCall || this.isMuted || this.botSpeaking || this.isRecording) return;

    try {
      // Clean up previous stream
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => track.stop());
      }

      this.currentStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Check browser support for different formats
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = ''; // Use browser default
      }

      const options = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.currentStream, options);

      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log(`Audio chunk received: ${event.data.size} bytes`);
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped, processing recording...");
        this.processRecording();
      };

      this.mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        this.isRecording = false;
        this.resumeListening();
      };

      // Start recording with smaller intervals for better responsiveness
      this.mediaRecorder.start(250);

      // Update UI
      this.transcription.textContent = "Listening...";

      // Setup silence detection
      this.setupCallSilenceDetection();

      // Max 30 seconds per turn
      this.recordingTimer = setTimeout(() => {
        console.log("Recording timeout reached");
        this.stopRecording();
      }, 30000);

    } catch (error) {
      console.error("Error starting listening:", error);
      this.isRecording = false;
      // Retry in 2 seconds
      setTimeout(() => {
        if (this.inCall && !this.botSpeaking) {
          this.startContinuousListening();
        }
      }, 2000);
    }
  }

  setupCallSilenceDetection() {
    if (!this.audioContext || !this.analyser || !this.currentStream) {
      this.setupAudioAnalysis(this.currentStream);
    }

    let speechDetected = false;
    let lastSpeechTime = Date.now();
    let consecutiveSilenceChecks = 0;

    const checkAudioLevel = () => {
      if (!this.isRecording || !this.analyser) return;

      this.analyser.getByteFrequencyData(this.dataArray);
      const average = this.dataArray.reduce((a, b) => a + b) / this.dataArray.length;

      // More sensitive threshold
      if (average > 8) {
        speechDetected = true;
        lastSpeechTime = Date.now();
        consecutiveSilenceChecks = 0;

        // Clear any existing silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (speechDetected) {
        consecutiveSilenceChecks++;
        const silenceDuration = Date.now() - lastSpeechTime;

        // 2 seconds of silence after speech
        if (silenceDuration > 2000 && !this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            console.log("Silence detected, stopping recording");
            this.stopRecording();
          }, 100);
        }
      }

      if (this.isRecording) {
        requestAnimationFrame(checkAudioLevel);
      }
    };

    // Only start if we have a valid stream
    if (this.currentStream && this.currentStream.active) {
      checkAudioLevel();
    }
  }

  stopRecording() {
    if (!this.isRecording) return;

    console.log("Stopping recording...");
    this.isRecording = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch (error) {
        console.error("Error stopping MediaRecorder:", error);
      }
    }

    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.transcription.textContent = "Processing...";
  }

  async processRecording() {
    console.log(`Processing recording with ${this.audioChunks.length} chunks`);
    
    if (this.audioChunks.length === 0) {
      console.log("No audio chunks, resuming listening");
      this.resumeListening();
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { 
        type: this.mediaRecorder ? this.mediaRecorder.mimeType : "audio/webm" 
      });
      
      console.log(`Audio blob created: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

      // Validate audio size (minimum 1KB for meaningful audio)
      if (audioBlob.size < 1000) {
        console.log('Audio too small (likely silence), skipping...');
        this.resumeListening();
        return;
      }

      // Convert to base64 for reliable Socket.IO transmission
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const base64Audio = reader.result.split(',')[1];
          const audioData = {
            audio: base64Audio,
            mimeType: audioBlob.type,
            size: audioBlob.size,
            timestamp: Date.now()
          };
          
          console.log(`Sending audio data: ${audioData.size} bytes`);
          this.socket.emit("audio-data", audioData);
          
        } catch (error) {
          console.error("Error preparing audio data:", error);
          this.resumeListening();
        }
      };
      
      reader.onerror = () => {
        console.error("Error reading audio blob");
        this.resumeListening();
      };
      
      reader.readAsDataURL(audioBlob);

    } catch (error) {
      console.error("Error processing recording:", error);
      this.resumeListening();
    }

    this.audioChunks = [];

    // Stop current stream after processing
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
  }

  async playAudioResponse(audioData) {
    console.log("🔊 Bot speaking...");
    this.botSpeaking = true;

    if (!this.voiceEnabled) {
      this.botSpeaking = false;
      this.resumeListening();
      return;
    }

    try {
      let audioBuffer;
      
      // Handle different audio data formats
      if (typeof audioData === 'string') {
        // Base64 string
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioBuffer = bytes.buffer;
      } else if (audioData instanceof ArrayBuffer) {
        audioBuffer = audioData;
      } else {
        audioBuffer = audioData;
      }

      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const audioUrl = URL.createObjectURL(blob);

      this.audioPlayer.src = audioUrl;
      
      const playPromise = this.audioPlayer.play();
      await playPromise;

      this.audioPlayer.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.botSpeaking = false;
        console.log("🔊 Bot finished speaking");

        // Resume listening after bot finishes
        setTimeout(() => {
          this.resumeListening();
        }, 500);
      };

      this.audioPlayer.onerror = (error) => {
        console.error("Audio playback error:", error);
        URL.revokeObjectURL(audioUrl);
        this.botSpeaking = false;
        this.resumeListening();
      };

    } catch (error) {
      console.error("Error playing audio:", error);
      this.botSpeaking = false;
      this.resumeListening();
    }
  }

  resumeListening() {
    if (this.inCall && !this.isMuted && !this.botSpeaking && !this.isRecording) {
      console.log("Resuming listening...");
      setTimeout(() => {
        this.startContinuousListening();
      }, 500);
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

    // Clean up streams
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }

    // Reset states
    this.inCall = false;
    this.botSpeaking = false;
    this.isRecording = false;

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

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  window.voicebotApp = new VoicebotApp();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && window.voicebotApp && window.voicebotApp.isRecording) {
    window.voicebotApp.stopRecording();
  }
});

window.addEventListener("beforeunload", () => {
  if (window.voicebotApp) {
    window.voicebotApp.endCall();
  }
});
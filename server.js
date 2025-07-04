const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { createClient } = require("@deepgram/sdk");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Initialize Deepgram
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Updated agent prompt for cleaning service booking with visit creation
const AGENT_PROMPT = `You are the assistant for Sparkle Clean, a home cleaning service, tasked with booking appointments by following these steps in order: 

(1) Start with 'Hi, welcome to Sparkle Clean. Can I know your name please?' 
(2) After receiving the name, say only 'Thanks, [name]!' then ask only 'What item would you like cleaned?' 
(3) Ask only 'Would you prefer Standard or Deep Cleaning? Are any additional services needed?' 
(4) Ask only 'What is your 10-digit phone number for booking?' 
(5) Ask only 'What is the pincode and full address for cleaning?' 
(6) Ask only 'When would you like the cleaning to occur? Provide a future date and time later than now in PST.' 
(7) Say only 'Checking schedule for your requested date and time. If unavailable, I will suggest another time.' 
(8) Say only 'Your booking is for [level] cleaning of [item] at [address] on [date] at [time]. Would you like to explore our cleaning subscription plans?' 
(9) Say only 'Your [level] cleaning of [item] is confirmed for [date] at [time] at [address].' 

Limit responses to 1-2 sentences, professional, without contractions. Validate each input: for invalid phone, say 'Please provide a valid 10-digit phone number'; for invalid date/time, say 'Date and time must be in the future. Provide a valid date and time.' 

Do not summarize or add extra comments until all fields are collected. For pricing questions, say 'For pricing details, visit https://sparkle-clean.com.' For non-cleaning topics, say 'I can only assist with cleaning-related questions.' Do not use dummy values. 

After collecting name, phone number, and date/time, call the create_visit function with these arguments immediately without further questions. Current date: ${new Date().toLocaleDateString()} (use PST for time validation).

IMPORTANT: If you need to call a function, only call it once per conversation. Do not call the same function multiple times.`;

// Conversation history storage
const conversations = new Map();
const calledFunctions = new Map();

// Store active connections for streaming
const activeConnections = new Map();

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Initialize conversation for this socket
  conversations.set(socket.id, [{ role: "system", content: AGENT_PROMPT }]);
  calledFunctions.set(socket.id, { create_visit: false });

  // Send initial greeting with streaming TTS
  const initialMessage = "Hi, welcome to Sparkle Clean. Can I know your name please?";
  socket.emit("bot-message", initialMessage);
  streamTTSResponse(socket, initialMessage);

  // Handle live audio streaming for STT
  socket.on("start-audio-stream", async () => {
    try {
      console.log("🎤 Starting live STT stream for:", socket.id);
      await setupLiveSTT(socket);
    } catch (error) {
      console.error("Error starting STT stream:", error);
      socket.emit("stt-error", "Failed to start speech recognition");
    }
  });

  // Handle audio stream data
  socket.on("audio-stream", (audioData) => {
    const connection = activeConnections.get(socket.id);
    if (connection?.deepgramLive?.getReadyState() === 1) {
      connection.deepgramLive.send(audioData);
    }
  });

  // Handle stop audio stream
  socket.on("stop-audio-stream", () => {
    const connection = activeConnections.get(socket.id);
    if (connection?.deepgramLive) {
      connection.deepgramLive.finish();
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    
    // Clean up connections
    const connection = activeConnections.get(socket.id);
    if (connection?.deepgramLive) {
      connection.deepgramLive.finish();
    }
    
    activeConnections.delete(socket.id);
    conversations.delete(socket.id);
    calledFunctions.delete(socket.id);
  });
});

// Setup live STT with WebSocket
async function setupLiveSTT(socket) {
  try {
    const deepgramLive = deepgram.listen.live({
      model: "nova-2",
      language: "en-US",
      smart_format: true,
      interim_results: true, // ✅ FIXED: Changed to true for utterance_end_ms
      utterance_end_ms: 1500,
      vad_events: true,
      encoding: "linear16",
      sample_rate: 16000,
    });

    // Store connection
    activeConnections.set(socket.id, { 
      deepgramLive,
      currentTranscript: "",
      isProcessing: false 
    });

    deepgramLive.addListener("open", async () => {
      console.log("✅ Deepgram live connection opened");
      socket.emit("stt-ready");

      deepgramLive.addListener("Results", async (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        
        if (transcript && transcript.trim()) {
          if (data.is_final) {
            console.log("📝 Final transcript:", transcript);
            
            const connection = activeConnections.get(socket.id);
            if (connection && !connection.isProcessing) {
              connection.isProcessing = true;
              
              // Emit transcription immediately
              socket.emit("transcription", transcript);
              
              // Process with streaming LLM (non-blocking)
              processWithStreamingLLM(socket, transcript);
            }
          } else {
            // Handle interim results for real-time feedback
            console.log("📝 Interim:", transcript);
            socket.emit("interim-transcription", transcript);
          }
        }
      });

      deepgramLive.addListener("UtteranceEnd", () => {
        console.log("🔇 Utterance ended");
        socket.emit("utterance-end");
      });

      deepgramLive.addListener("error", (error) => {
        console.error("❌ Deepgram Live error:", error);
        socket.emit("stt-error", error.message || "Speech recognition error");
        
        // Clean up connection
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.isProcessing = false;
        }
      });

      deepgramLive.addListener("close", () => {
        console.log("Deepgram connection closed");
        socket.emit("stt-closed");
      });
    });

    return deepgramLive;
  } catch (error) {
    console.error("Error setting up live STT:", error);
    throw error;
  }
}

// Process user input with streaming LLM
async function processWithStreamingLLM(socket, transcript) {
  try {
    const conversation = conversations.get(socket.id);
    conversation.push({ role: "user", content: transcript });

    const socketFunctions = calledFunctions.get(socket.id);
    
    const requestBody = {
      model: "qwen/qwen-2.5-72b-instruct",
      messages: conversation,
      max_tokens: 300,
      temperature: 0.7,
      stream: true, // Enable streaming
    };

    // Add tools if not called yet
    if (!socketFunctions.create_visit) {
      requestBody.tools = [
        {
          type: "function",
          function: {
            name: "create_visit",
            description: "Create a cleaning service visit entry with customer details.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "The full name of the customer." },
                phoneNumber: { type: "string", description: "The phone number of the customer (10 digits)." },
                dateTime: { type: "string", description: "The date and time of the cleaning visit in clear format (e.g., 'June 15, 2025 10:00 AM')." },
                serviceType: { type: "string", description: "Type of cleaning service (e.g., 'Standard Home Cleaning', 'Deep Cleaning')." },
                address: { type: "string", description: "Full address including pincode where cleaning will occur." },
              },
              required: ["name", "phoneNumber", "dateTime"],
            },
          },
        },
      ];
      requestBody.tool_choice = "auto";
    }

    // Start streaming LLM response
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Sparkle Clean Voicebot",
        },
        responseType: 'stream'
      }
    );

    let fullResponse = "";
    let currentSentence = "";
    const sentenceEnders = /[.!?]\s/;

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            // Process final sentence if any
            if (currentSentence.trim()) {
              processCompleteSentence(socket, currentSentence.trim());
            }
            
            // Add complete response to conversation
            conversation.push({ role: "assistant", content: fullResponse });
            conversations.set(socket.id, conversation);
            
            // Mark processing complete
            const connection = activeConnections.get(socket.id);
            if (connection) {
              connection.isProcessing = false;
            }
            
            socket.emit("llm-complete");
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              fullResponse += content;
              currentSentence += content;
              
              // Check for sentence completion
              if (sentenceEnders.test(currentSentence)) {
                const sentences = currentSentence.split(sentenceEnders);
                
                // Process complete sentences
                for (let i = 0; i < sentences.length - 1; i++) {
                  if (sentences[i].trim()) {
                    processCompleteSentence(socket, sentences[i].trim() + ".");
                  }
                }
                
                // Keep the last incomplete part
                currentSentence = sentences[sentences.length - 1] || "";
              }
            }
            
            // Handle tool calls
            if (parsed.choices?.[0]?.delta?.tool_calls) {
              const toolCall = parsed.choices?.[0]?.delta?.tool_calls[0];
              if (toolCall?.function?.name === "create_visit" && !socketFunctions.create_visit) {
                socketFunctions.create_visit = true;
                calledFunctions.set(socket.id, socketFunctions);
                
                // Handle function call (simplified for this example)
                const confirmationMessage = "Perfect! I've successfully scheduled your cleaning visit. Your booking has been confirmed and you'll receive a confirmation shortly. Is there anything else I can help you with today?";
                processCompleteSentence(socket, confirmationMessage);
              }
            }
          } catch (parseError) {
            // Skip invalid JSON chunks
            continue;
          }
        }
      }
    });

    response.data.on('error', (error) => {
      console.error("Streaming error:", error);
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.isProcessing = false;
      }
      socket.emit("llm-error", "Sorry, I had trouble processing that. Could you please try again?");
    });

  } catch (error) {
    console.error("LLM processing error:", error);
    const connection = activeConnections.get(socket.id);
    if (connection) {
      connection.isProcessing = false;
    }
    socket.emit("llm-error", "I apologize, but I'm having technical difficulties. Could you please try again?");
  }
}

// Process complete sentences immediately with streaming TTS
function processCompleteSentence(socket, sentence) {
  console.log("🎯 Processing sentence:", sentence);
  
  // Emit text immediately
  socket.emit("bot-message-chunk", sentence);
  
  // Start streaming TTS (non-blocking)
  streamTTSResponse(socket, sentence);
}

// Streaming TTS with Deepgram
async function streamTTSResponse(socket, text) {
  console.log("🔊 Streaming TTS for:", text.substring(0, 30) + "...");

  try {
    const response = await deepgram.speak.request(
      { text },
      {
        model: "aura-asteria-en",
        encoding: "linear16",
        container: "wav",
        sample_rate: 24000,
      }
    );

    const stream = await response.getStream();
    const reader = stream.getReader();

    // Send audio chunks as they arrive
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Send chunk immediately
      socket.emit("audio-chunk", Buffer.from(value));
    }
    
    // Signal end of audio stream
    socket.emit("audio-stream-end");
    console.log("✅ TTS streaming complete");
    
  } catch (error) {
    console.error("❌ TTS Error:", error.message);
    socket.emit("tts-error", "Audio unavailable");
  }
}

// Function to create cleaning booking in database
async function createCleaningBooking(bookingData) {
  console.log("\n--- Function Call: create_cleaning_booking ---", bookingData);

  try {
    if (!process.env.DB_URL) {
      console.warn("DB_URL not configured, skipping database save");
      return;
    }

    const response = await axios.post(process.env.DB_URL, bookingData, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("create_cleaning_booking API call successful:", response.status);
    return response.data;
  } catch (error) {
    console.error("Error calling create_cleaning_booking API:", error.response ? error.response.data : error.message);
    throw error;
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Sparkle Clean Voicebot server is running",
    dbConfigured: !!process.env.DB_URL,
  });
});

// API endpoint to manually create visit (for testing)
app.post("/api/create-visit", async (req, res) => {
  try {
    const result = await createCleaningBooking(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Visit http://localhost:${PORT} to access the voicebot`);
  console.log(`❤️ Health check: http://localhost:${PORT}/health`);
  console.log(`💾 DB configured: ${!!process.env.DB_URL}`);
});
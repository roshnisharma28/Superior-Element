const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@deepgram/sdk');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Track which functions have been called in the current conversation
const calledFunctions = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Initialize conversation for this socket
  conversations.set(socket.id, [
    { role: 'system', content: AGENT_PROMPT }
  ]);

  // Initialize function tracking for this socket
  calledFunctions.set(socket.id, {
    create_visit: false
  });

  // Send initial greeting
  const initialMessage = 'Hi, welcome to Sparkle Clean. Can I know your name please?';
  socket.emit('bot-message', initialMessage);
  generateAndSendAudio(socket, initialMessage);

  // Handle audio data from client
  socket.on('audio-data', async (audioData) => {
    try {
      console.log('Received audio data from client');

      // Convert audio to text using Deepgram
      const text = await transcribeAudio(audioData);

      if (text && text.trim()) {
        console.log('Transcribed text:', text);
        socket.emit('transcription', text);

        // Add user message to conversation
        const conversation = conversations.get(socket.id);
        conversation.push({ role: 'user', content: text });

        // Get response from LLM with function calling
        const botResponse = await getLLMResponseWithFunctions(socket.id, conversation);

        if (botResponse) {
          console.log('Bot response:', botResponse);

          // Add bot response to conversation
          conversation.push({ role: 'assistant', content: botResponse });
          conversations.set(socket.id, conversation);

          // Send text response
          socket.emit('bot-message', botResponse);

          // Generate and send audio response
          await generateAndSendAudio(socket, botResponse);
        }
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      socket.emit('error', 'Sorry, I had trouble processing that. Could you please try again?');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    conversations.delete(socket.id);
    calledFunctions.delete(socket.id);
  });
});

const fs = require('fs').promises;
const path = require('path');

// Function to transcribe audio using Deepgram
async function transcribeAudio(audioBuffer) {
  let tempFilePath = null;

  try {
    console.log('🎤 Processing audio buffer, size:', audioBuffer.length);

    if (audioBuffer.length === 0) {
      console.warn('⚠️ Empty audio buffer received');
      return '';
    }

    // Create temporary file
    const tempDir = './temp';
    await fs.mkdir(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);

    // Write buffer to temporary file
    await fs.writeFile(tempFilePath, Buffer.from(audioBuffer));
    console.log('📁 Temporary audio file created:', tempFilePath);

    const response = await deepgram.listen.prerecorded.transcribeFile(
      { stream: await fs.readFile(tempFilePath), mimetype: 'audio/webm' },
      {
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        diarize: false,
        punctuate: true,
        utterances: true
      }
    );

    console.log('📝 Deepgram response received');

    const transcript = response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    console.log('✅ Extracted transcript:', transcript || '(no transcript)');

    return transcript || '';
  } catch (error) {
    console.error('❌ Deepgram transcription error:', error);
    console.error('Error details:', error.message);
    return '';
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        console.log('🗑️ Temporary file cleaned up');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup temporary file:', cleanupError.message);
      }
    }
  }
}

// Function to get LLM response from OpenRouter with function calling support
async function getLLMResponseWithFunctions(socketId, conversation) {
  try {
    const socketFunctions = calledFunctions.get(socketId);

    const requestBody = {
      model: 'qwen/qwen-2.5-72b-instruct',
      messages: conversation,
      max_tokens: 300,
      temperature: 0.7,
    };

    // Only include tools if they haven't been called yet
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
                name: {
                  type: "string",
                  description: "The full name of the customer."
                },
                phoneNumber: {
                  type: "string",
                  description: "The phone number of the customer (10 digits)."
                },
                dateTime: {
                  type: "string",
                  description: "The date and time of the cleaning visit in clear format (e.g., 'June 15, 2025 10:00 AM')."
                },
                serviceType: {
                  type: "string",
                  description: "Type of cleaning service (e.g., 'Standard Home Cleaning', 'Deep Cleaning')."
                },
                address: {
                  type: "string",
                  description: "Full address including pincode where cleaning will occur."
                }
              },
              required: ["name", "phoneNumber", "dateTime"]
            }
          }
        }
      ];
      requestBody.tool_choice = "auto";
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Sparkle Clean Voicebot'
        }
      }
    );

    const message = response.data.choices[0].message;

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.function && toolCall.function.name === "create_visit" && !socketFunctions.create_visit) {
          console.log("Tool call detected for create_visit");
          socketFunctions.create_visit = true;
          calledFunctions.set(socketId, socketFunctions);

          try {
            // Parse the function arguments
            const functionArgs = JSON.parse(toolCall.function.arguments);
            console.log("Creating visit with args:", functionArgs);

            // Call the visit creation function
            await createCleaningBooking(functionArgs);

            // Add the tool call to conversation history
            const conversation = conversations.get(socketId);
            conversation.push({
              role: "assistant",
              content: "",
              tool_calls: message.tool_calls
            });

            // Add the function response to conversation history
            conversation.push({
              role: "function",
              name: "create_visit",
              content: JSON.stringify({
                status: "success",
                message: "Visit created successfully"
              })
            });

            conversations.set(socketId, conversation);

            // Return confirmation message
            return "Perfect! I've successfully scheduled your cleaning visit. Your booking has been confirmed and you'll receive a confirmation shortly. Is there anything else I can help you with today?";

          } catch (error) {
            console.error("Error calling create_visit:", error);
            return "I've noted all your details for the cleaning visit. Our team will contact you shortly to confirm the booking. Is there anything else I can help you with?";
          }
        }
      }
    }

    return message.content;
  } catch (error) {
    console.error('OpenRouter API error:', error.response?.data || error.message);
    return 'I apologize, but I\'m having technical difficulties. Could you please try again?';
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
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log("create_cleaning_booking API call successful:", response.status);
    return response.data;
  } catch (error) {
    console.error('Error calling create_cleaning_booking API:',
      error.response ? error.response.data : error.message);
    throw error; // Re-throw to handle in calling function
  }
}

// Function to generate audio using Deepgram TTS and send to client
async function generateAndSendAudio(socket, text) {
  try {
    const response = await deepgram.speak.request(
      { text },
      {
        model: 'aura-asteria-en',
        encoding: 'mp3',
        container: 'mp3'
      }
    );

    const stream = await response.getStream();
    if (stream) {
      const chunks = [];

      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const audioBuffer = Buffer.concat(chunks);
        socket.emit('audio-response', audioBuffer);
      });
    }
  } catch (error) {
    console.error('Deepgram TTS error:', error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Sparkle Clean Voicebot server is running',
    dbConfigured: !!process.env.DB_URL
  });
});

// API endpoint to manually create visit (for testing)
app.post('/api/create-visit', async (req, res) => {
  try {
    const result = await createCleaningBooking(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the voicebot`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`DB configured: ${!!process.env.DB_URL}`);
});
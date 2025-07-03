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

// Agent prompt for cleaning service booking
const AGENT_PROMPT = `You are a friendly and professional customer service representative for "Sparkle Clean" - a premium cleaning service company. Your job is to help customers book cleaning services through a voice conversation.

Guidelines:
- Be warm, professional, and helpful
- Ask relevant questions to understand their cleaning needs
- Collect essential information: name, phone number, address, preferred date/time, type of cleaning needed
- Explain our services clearly: Regular cleaning, Deep cleaning, Move-in/out cleaning, Post-construction cleaning
- Provide pricing estimates when asked
- Confirm all details before finalizing the booking
- Keep responses concise and conversational for voice interaction
- If asked about anything outside cleaning services, politely redirect the conversation back to booking

Always end your responses in a way that encourages continued conversation until the booking is complete.

Current conversation context: Customer is calling to book a cleaning service.`;

// Conversation history storage
const conversations = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Initialize conversation for this socket
  conversations.set(socket.id, [
    { role: 'system', content: AGENT_PROMPT },
    { role: 'assistant', content: 'Hello! Welcome to Sparkle Clean. I\'m here to help you book a cleaning service. May I start by getting your name?' }
  ]);

  // Send initial greeting
  socket.emit('bot-message', 'Hello! Welcome to Sparkle Clean. I\'m here to help you book a cleaning service. May I start by getting your name?');
  generateAndSendAudio(socket, 'Hello! Welcome to Sparkle Clean. I\'m here to help you book a cleaning service. May I start by getting your name?');

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
        
        // Get response from LLM
        const botResponse = await getLLMResponse(conversation);
        
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
  });
});

// Function to transcribe audio using Deepgram
async function transcribeAudio(audioBuffer) {
  try {
    const response = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        diarize: false,
      }
    );

    const transcript = response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return transcript || '';
  } catch (error) {
    console.error('Deepgram transcription error:', error);
    return '';
  }
}

// Function to get LLM response from OpenRouter
async function getLLMResponse(conversation) {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'qwen/qwen-2.5-72b-instruct',
        messages: conversation,
        max_tokens: 300,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Cleaning Service Voicebot'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('OpenRouter API error:', error.response?.data || error.message);
    return 'I apologize, but I\'m having technical difficulties. Could you please try again?';
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
  res.json({ status: 'ok', message: 'Voicebot server is running' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to access the voicebot`);
});
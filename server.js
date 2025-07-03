const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Environment variables
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

// Check if environment variables are set
if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is not set in environment variables');
    process.exit(1);
}

console.log('DB configured: true');

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Send welcome message when client connects
    setTimeout(() => {
        const welcomeMessage = "Hi, welcome to Sparkle Clean. How can I help you today?";
        console.log(`🔊 Generating audio for: ${welcomeMessage.substring(0, 50)}...`);
        
        // Send bot message
        socket.emit('bot-message', welcomeMessage);
        
        // Generate and send welcome audio
        generateTTS(welcomeMessage)
            .then(audioBuffer => {
                if (audioBuffer) {
                    console.log('✅ Audio sent successfully!');
                    socket.emit('audio-response', audioBuffer);
                } else {
                    console.log('❌ Failed to generate welcome audio');
                }
            })
            .catch(error => {
                console.error('Error generating welcome audio:', error);
            });
    }, 1000);

    // Handle audio data from client
    socket.on('audio-data', async (audioData) => {
        try {
            console.log(`Received audio data from client: ${audioData.size} bytes, type: ${audioData.mimeType}`);
            
            // Validate audio data
            if (!audioData.audio || !audioData.size || audioData.size < 1000) {
                console.log('❌ Audio data invalid or too small, skipping...');
                return;
            }

            // Send confirmation to client
            socket.emit('audio-received', { 
                size: audioData.size, 
                mimeType: audioData.mimeType,
                timestamp: audioData.timestamp 
            });

            // Convert base64 back to buffer
            const audioBuffer = Buffer.from(audioData.audio, 'base64');
            console.log(`📝 Processing audio buffer: ${audioBuffer.length} bytes`);

            // Convert audio and transcribe
            const transcription = await transcribeAudio(audioBuffer, audioData.mimeType);
            
            if (transcription && transcription.trim()) {
                console.log(`🎯 Transcription: "${transcription}"`);
                socket.emit('transcription', transcription);
                
                // Generate bot response
                const botResponse = await generateBotResponse(transcription);
                console.log(`🤖 Bot response: "${botResponse}"`);
                socket.emit('bot-message', botResponse);
                
                // Generate and send audio response
                const audioResponse = await generateTTS(botResponse);
                if (audioResponse) {
                    console.log('✅ TTS audio generated and sent');
                    socket.emit('audio-response', audioResponse);
                } else {
                    console.log('❌ Failed to generate TTS audio');
                    socket.emit('tts-error', 'Failed to generate audio response');
                }
            } else {
                console.log('❌ No speech detected in audio or transcription failed');
            }

        } catch (error) {
            console.error('❌ Error processing audio:', error);
            socket.emit('error', 'Failed to process audio');
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Speech-to-Text using OpenAI Whisper
async function transcribeAudio(audioBuffer, mimeType) {
    try {
        // Create a temporary file
        const tempFileName = `temp_audio_${Date.now()}`;
        const tempFilePath = path.join(__dirname, 'temp', tempFileName);
        
        // Ensure temp directory exists
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Write buffer to file
        fs.writeFileSync(tempFilePath, audioBuffer);

        // Prepare form data for OpenAI Whisper API
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFilePath), {
            filename: tempFileName,
            contentType: mimeType || 'audio/webm'
        });
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');
        formData.append('response_format', 'text');

        // Call OpenAI Whisper API
        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                ...formData.getHeaders()
            },
            timeout: 30000 // 30 second timeout
        });

        // Clean up temp file
        try {
            fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
            console.warn('Warning: Could not delete temp file:', cleanupError.message);
        }

        const transcription = response.data.trim();
        console.log(`✅ Whisper transcription successful: "${transcription}"`);
        return transcription;

    } catch (error) {
        console.error('❌ Whisper transcription error:', error.response?.data || error.message);
        
        // Clean up temp file on error
        try {
            const tempFileName = `temp_audio_${Date.now()}`;
            const tempFilePath = path.join(__dirname, 'temp', tempFileName);
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        
        return null;
    }
}

// Generate bot response using OpenAI GPT
async function generateBotResponse(userMessage) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful assistant for Sparkle Clean, a professional cleaning service. 
                    You help customers with booking appointments, answering questions about services, and providing information about cleaning options.
                    Keep responses conversational, friendly, and concise (1-2 sentences). 
                    Focus on being helpful and professional.`
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('❌ OpenAI GPT error:', error.response?.data || error.message);
        return "I'm sorry, I'm having trouble understanding right now. Could you please try again?";
    }
}

// Text-to-Speech using OpenAI TTS
async function generateTTS(text) {
    try {
        console.log(`🔊 Generating TTS for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        const response = await axios.post('https://api.openai.com/v1/audio/speech', {
            model: 'tts-1',
            voice: 'alloy',
            input: text,
            response_format: 'wav'
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });

        console.log(`✅ TTS generated: ${response.data.byteLength} bytes`);
        return response.data;
    } catch (error) {
        console.error('❌ OpenAI TTS error:', error.response?.data || error.message);
        return null;
    }
}

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Voicebot server running on port ${PORT}`);
    console.log(`📱 Access the app at: http://localhost:${PORT}`);
});

module.exports = app;
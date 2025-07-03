# 🎙️ Voice Bot Application

A real-time voice-enabled chatbot using OpenAI's Whisper (Speech-to-Text) and TTS (Text-to-Speech) APIs. Built with Node.js, Socket.IO, and vanilla JavaScript.

## 🚀 Features

- **Real-time voice conversation** with AI assistant
- **Speech-to-Text** using OpenAI Whisper API
- **Text-to-Speech** using OpenAI TTS API
- **Continuous listening** with automatic silence detection
- **Modern UI** with responsive design
- **Real-time audio streaming** via Socket.IO
- **Mute/unmute functionality**
- **Connection status indicators**

## 🛠️ Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- OpenAI API account with credits
- Modern web browser with microphone support

### 2. Installation

1. **Clone or download the project files**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_actual_api_key_here
   PORT=3000
   ```

4. **Create required directories:**
   ```bash
   mkdir temp
   mkdir public
   ```

### 3. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account or sign in
3. Navigate to [API Keys](https://platform.openai.com/api-keys)
4. Create a new secret key
5. Copy the key to your `.env` file

### 4. Run the Application

```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

### 5. Access the Application

Open your browser and go to: `http://localhost:3000`

## 🔧 File Structure

```
voicebot-app/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── README.md             # This file
├── temp/                 # Temporary audio files (auto-created)
├── public/               # Client-side files
│   ├── index.html        # Main HTML file
│   └── app.js           # Client-side JavaScript
├── app-fixed.js         # Fixed client code (reference)
└── client-analysis.md   # Issues analysis
```

## 🐛 Troubleshooting

### Common Issues and Solutions

#### 1. "No audio detected" or empty transcriptions

**Symptoms:** Server logs show "Received audio data" but no transcription

**Solutions:**
- Check microphone permissions in browser
- Ensure audio chunks are being created (check browser console)
- Verify audio blob size is > 1KB
- Test microphone with other applications

#### 2. Audio not playing from bot

**Symptoms:** TTS generated but no audio heard

**Solutions:**
- Check browser audio permissions
- Verify audio element is not muted
- Check browser console for audio errors
- Try different browsers (Chrome/Firefox recommended)

#### 3. Connection issues

**Symptoms:** "Connecting..." status never changes

**Solutions:**
- Check if server is running on correct port
- Verify no firewall blocking connections
- Check browser console for Socket.IO errors
- Restart server and refresh browser

#### 4. OpenAI API errors

**Symptoms:** 401 Unauthorized or quota exceeded errors

**Solutions:**
- Verify OpenAI API key is correct
- Check API credits/billing status
- Ensure API key has proper permissions
- Check rate limits

### Debug Mode

To enable detailed logging, add this to your browser console:
```javascript
localStorage.setItem('debug', 'socket.io-client:*');
```

## 📝 Key Improvements Made

### Client-Side Fixes:
1. **Better stream management** - Properly clean up MediaStreams
2. **Audio validation** - Check audio size before sending
3. **Base64 encoding** - Reliable Socket.IO transmission
4. **Improved error handling** - Better recovery from failures
5. **Enhanced logging** - Detailed debugging information

### Server-Side Fixes:
1. **Proper audio processing** - Convert base64 to buffer correctly
2. **Whisper integration** - Complete STT implementation
3. **TTS implementation** - OpenAI TTS API integration
4. **Better error handling** - Graceful failure recovery
5. **Detailed logging** - Track audio processing pipeline

## 🔍 Testing

1. **Start the application** and allow microphone access
2. **Click "Start Voice Call"** - should connect and show welcome message
3. **Speak into microphone** - should see "Listening..." then "Processing..."
4. **Check transcription** - your speech should appear as text
5. **Listen for response** - bot should respond with audio

## 📊 Performance Tips

- Use Chrome or Firefox for best WebRTC support
- Ensure stable internet connection for API calls
- Keep conversations concise to reduce API costs
- Close other audio applications to avoid conflicts

## 💡 Customization

### Change Bot Personality
Edit the system prompt in `server.js`:
```javascript
content: `You are a helpful assistant for [Your Company]...`
```

### Adjust Audio Settings
Modify audio constraints in `app.js`:
```javascript
audio: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
```

### Change Voice
Update TTS voice in `server.js`:
```javascript
voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
```

## 🔐 Security Notes

- Never commit `.env` file to version control
- Use environment variables for sensitive data
- Consider rate limiting for production use
- Validate all audio input on server side

## 📞 Support

If you encounter issues:

1. Check browser console for errors
2. Review server logs for API errors
3. Verify all dependencies are installed
4. Ensure OpenAI API key has sufficient credits
5. Test with different browsers/devices

## 🎯 Next Steps

- Add conversation history
- Implement user authentication
- Add support for multiple languages
- Create mobile-responsive design
- Add conversation analytics
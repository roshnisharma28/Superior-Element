# Sparkle Clean - Voice Booking Assistant

A sophisticated web-based voicebot application for booking cleaning services. Built with real-time voice interaction using Deepgram for speech processing and OpenRouter for intelligent conversation handling.

## 🎯 Features

- **Real-time Voice Interaction**: Click to start talking with the AI assistant
- **Speech-to-Text**: Powered by Deepgram's advanced STT technology
- **Text-to-Speech**: Natural-sounding voice responses using Deepgram TTS
- **Intelligent Conversation**: Uses Qwen 2.5 72B model via OpenRouter for smart responses
- **Automated Visit Creation**: Automatically creates cleaning appointments in your database
- **Function Calling**: AI agent calls database functions when booking is complete
- **Database Integration**: Seamless integration with Dataverse or custom APIs
- **Beautiful UI**: Modern, responsive design with smooth animations
- **Voice Activity Detection**: Automatically stops recording after silence
- **Conversation History**: Track the entire booking conversation
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices

## 🚀 Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.io
- **Speech-to-Text**: Deepgram API
- **Text-to-Speech**: Deepgram API
- **Language Model**: Qwen 2.5 72B (via OpenRouter)
- **Audio Processing**: Web Audio API, MediaRecorder API

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Microphone access (for voice input)
- Modern web browser with WebRTC support

## 🔑 API Keys Required

You'll need API keys from the following services:

1. **Deepgram** (for STT and TTS)
   - Sign up at: https://console.deepgram.com/
   - Get your API key from the dashboard

2. **OpenRouter** (for LLM)
   - Sign up at: https://openrouter.ai/
   - Get your API key from: https://openrouter.ai/keys

## 🛠️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cleaning-service-voicebot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file and add your API keys:
   ```bash
   DEEPGRAM_API_KEY=your_deepgram_api_key_here
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   DB_URL=your_dataverse_api_url_here
   PORT=3000
   ```

4. **Run the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Access the application**
   Open your browser and go to: `http://localhost:3000`

## 🎮 How to Use

1. **Visit the Website**: Navigate to the application URL
2. **Start Voice Call**: Click the large blue "Start Voice Call" button
3. **Grant Permissions**: Allow microphone access when prompted
4. **Talk to the Bot**: Click "Tap to Talk" and speak your booking requirements
5. **Listen to Responses**: The bot will respond with voice and text
6. **Complete Booking**: Follow the conversation to complete your cleaning service booking

### Voice Interaction Tips

- Speak clearly and at normal volume
- Wait for the bot to finish speaking before responding
- Use natural language to describe your cleaning needs
- Provide the requested information: name, phone, address, preferred date/time, type of cleaning

### Keyboard Shortcuts

- **Spacebar**: Hold to record, release to stop (when call is active)
- **Mute Button**: Toggle microphone on/off
- **End Call**: Terminate the voice session

## 🗃️ Automated Visit Creation

The voicebot automatically creates cleaning appointments in your database when customers complete the booking process:

### How It Works

1. **Data Collection**: The AI assistant collects customer information step-by-step
2. **Function Calling**: When all required data is gathered, the AI calls the `create_visit` function
3. **Database Integration**: Visit details are automatically saved to your configured database
4. **Confirmation**: Customer receives immediate confirmation of their booking

### Required Information

The system collects and stores:
- **Customer Name**: Full name for the booking
- **Phone Number**: 10-digit contact number
- **Service Type**: Type of cleaning (Standard/Deep, specific items)
- **Address**: Complete address including pincode
- **Date & Time**: Preferred cleaning appointment time
- **Additional Services**: Any extra services requested

### Database Configuration

Set your database endpoint in the `.env` file:
```bash
DB_URL=https://your-api-endpoint.com/api/visits
```

The system will POST booking data in JSON format to this URL.

## 🏗️ Project Structure

```
cleaning-service-voicebot/
├── public/
│   ├── index.html          # Main HTML file
│   ├── style.css           # CSS styles
│   └── app.js              # Frontend JavaScript
├── server.js               # Express server & Socket.io
├── package.json            # Node.js dependencies
├── .env.example            # Environment variables template
└── README.md               # This file
```

## 🎨 Customization

### Modify the Agent Prompt

Edit the `AGENT_PROMPT` constant in `server.js` to customize the bot's behavior:

```javascript
const AGENT_PROMPT = `Your custom prompt here...`;
```

### Change TTS Voice

Modify the TTS model in the `generateAndSendAudio` function:

```javascript
model: 'aura-asteria-en', // Change to other Deepgram voices
```

### Adjust LLM Parameters

Modify the OpenRouter request in `getLLMResponse` function:

```javascript
{
  model: 'qwen/qwen-2.5-72b-instruct',
  max_tokens: 300,
  temperature: 0.7,
  // Add other parameters
}
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEEPGRAM_API_KEY` | Deepgram API key for STT/TTS | Required |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM | Required |
| `DB_URL` | Database/API URL for visit creation | Optional |
| `PORT` | Server port | 3000 |

### Audio Settings

The application uses optimized audio settings for best quality:

- **Sample Rate**: 16kHz
- **Echo Cancellation**: Enabled
- **Noise Suppression**: Enabled
- **Auto Gain Control**: Enabled

## 📱 Browser Compatibility

- Chrome/Chromium 66+
- Firefox 60+
- Safari 11.1+
- Edge 79+

**Note**: Microphone access requires HTTPS in production environments.

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Production Deployment

1. Set environment variables on your hosting platform
2. Ensure HTTPS is enabled for microphone access
3. Deploy using your preferred method:

```bash
# Using PM2
pm2 start server.js --name "voicebot"

# Using Docker
docker build -t voicebot .
docker run -p 3000:3000 --env-file .env voicebot
```

## 🛡️ Security Considerations

- API keys are stored securely in environment variables
- CORS is configured for cross-origin requests
- Input validation is implemented for all user inputs
- No sensitive data is logged or stored permanently

## 🐛 Troubleshooting

### Common Issues

1. **Microphone not working**
   - Ensure microphone permissions are granted
   - Check if browser supports MediaRecorder API
   - Verify HTTPS in production

2. **API errors**
   - Verify API keys are correct and active
   - Check API rate limits and quotas
   - Monitor console for error messages

3. **Connection issues**
   - Check network connectivity
   - Verify server is running
   - Check firewall settings

### Debug Mode

Enable debug logging by adding to your `.env`:
```
DEBUG=true
```

## 🧪 Testing

### ✅ Backend Testing
- [ ] Server starts without errors
- [ ] Health endpoint responds: `GET http://localhost:3000/health`
- [ ] Socket.io connection established
- [ ] API keys configured correctly
- [ ] Visit creation function works

### ✅ Frontend Testing
- [ ] UI loads correctly
- [ ] Voice call button appears
- [ ] Microphone permission requested
- [ ] Socket.io connects to backend
- [ ] Voice recording works
- [ ] Audio playback works

### ✅ Integration Testing
- [ ] Voice-to-text conversion
- [ ] LLM response generation
- [ ] Text-to-speech conversion
- [ ] Full conversation flow
- [ ] Visit creation functionality
- [ ] Database integration (if configured)
- [ ] Error handling works

### ✅ API Testing
Test the visit creation endpoint manually:
```bash
curl -X POST http://localhost:3000/api/create-visit \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phoneNumber": "1234567890",
    "dateTime": "June 15, 2025 10:00 AM",
    "serviceType": "Standard Home Cleaning",
    "address": "123 Main St, City, 12345"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": { ... }
}
```

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review browser console for errors
- Ensure all API keys are valid and have sufficient credits

---

**Happy voice chatting with Sparkle Clean! ✨🧹**
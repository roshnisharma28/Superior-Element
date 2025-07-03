# VS Code Setup Guide for Sparkle Clean Voicebot

## 🎯 Quick Start in VS Code

### 1. Create Project Structure
```bash
mkdir sparkle-clean-voicebot
cd sparkle-clean-voicebot
code .
```

### 2. Create Files in VS Code
Create these files in order:

#### 📄 package.json
```json
{
  "name": "cleaning-service-voicebot",
  "version": "1.0.0",
  "description": "Web-based voicebot for booking cleaning services",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.5",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "axios": "^1.6.2",
    "ws": "^8.14.2",
    "@deepgram/sdk": "^3.4.0",
    "multer": "^1.4.5-lts.1",
    "form-data": "^4.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "keywords": ["voicebot", "cleaning-service", "deepgram", "openrouter"],
  "author": "",
  "license": "MIT"
}
```

#### 📄 .env.example
```env
# Deepgram API Key for Speech-to-Text and Text-to-Speech
# Get your API key from: https://console.deepgram.com/
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# OpenRouter API Key for LLM (qwen/qwen-2.5-72b-instruct)
# Get your API key from: https://openrouter.ai/keys
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Server Port (optional, defaults to 3000)
PORT=3000
```

### 3. Create public/ Directory
In VS Code terminal:
```bash
mkdir public
```

### 4. Install Dependencies
In VS Code terminal:
```bash
npm install
```

### 5. Copy Environment File
```bash
cp .env.example .env
```

### 6. Add Your API Keys
Edit the `.env` file and add your actual API keys.

## 🔧 VS Code Configuration

### Recommended VS Code Settings
Create `.vscode/settings.json`:
```json
{
  "emmet.includeLanguages": {
    "javascript": "javascriptreact"
  },
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll": true
  }
}
```

### Launch Configuration
Create `.vscode/launch.json` for debugging:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Voicebot Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server.js",
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"]
    }
  ]
}
```

## 🚀 Running the Project

### Method 1: Using VS Code Terminal
1. Open terminal in VS Code (`Ctrl+``)
2. Run: `npm start`
3. Open browser: `http://localhost:3000`

### Method 2: Using VS Code Debug
1. Press `F5` or go to Run & Debug panel
2. Select "Launch Voicebot Server"
3. Click the green play button

### Method 3: Using npm Scripts
In package.json scripts section, VS Code shows run buttons:
- Click "▶ start" next to `"start": "node server.js"`

## 🧪 Testing in VS Code

### 1. Setup Verification
Run the setup check:
```bash
node setup-check.js
```

### 2. API Testing with Thunder Client
1. Install Thunder Client extension
2. Create new request:
   - URL: `http://localhost:3000/health`
   - Method: GET
   - Expected response: `{"status": "ok", "message": "Voicebot server is running"}`

### 3. Frontend Testing
1. Install Live Server extension
2. Right-click on `public/index.html`
3. Select "Open with Live Server"
4. Test the UI (note: backend must be running for full functionality)

## 📱 VS Code Features for This Project

### File Explorer Organization
```
📁 SPARKLE-CLEAN-VOICEBOT
├── 📁 .vscode/           # VS Code settings
├── 📁 node_modules/      # Dependencies (auto-created)
├── 📁 public/            # Frontend files
│   ├── 📄 index.html     # Main UI
│   ├── 📄 style.css      # Styling
│   └── 📄 app.js         # Frontend logic
├── 📄 .env               # Environment variables (create from .env.example)
├── 📄 .env.example       # Template for environment variables
├── 📄 package.json       # Project configuration
├── 📄 server.js          # Main server file
└── 📄 README.md          # Documentation
```

### IntelliSense Features
VS Code provides:
- **Auto-completion** for JavaScript/Node.js
- **Error highlighting** for syntax issues
- **Hover information** for functions and variables
- **Go to definition** (Ctrl+Click)
- **Find all references** (Shift+F12)

### Debugging Features
- Set breakpoints by clicking line numbers
- Step through code with F10/F11
- Watch variables in Debug panel
- View call stack and variables

## 🛠️ Development Workflow in VS Code

### 1. Start Development
```bash
npm run dev  # Uses nodemon for auto-restart
```

### 2. Edit Files
- **server.js**: Backend logic, API integrations
- **public/app.js**: Frontend JavaScript
- **public/style.css**: Styling and animations
- **public/index.html**: UI structure

### 3. View Changes
- Backend changes: Server auto-restarts with nodemon
- Frontend changes: Refresh browser or use Live Server

### 4. Debug Issues
- Check VS Code terminal for server logs
- Use browser DevTools for frontend debugging
- Set breakpoints in VS Code for server-side debugging

## 📊 Monitoring & Logs

### Server Logs in VS Code Terminal
```bash
# You'll see logs like:
Server running on port 3000
Visit http://localhost:3000 to access the voicebot
Client connected: abc123
Received audio data from client
Transcribed text: Hello, I need cleaning service
Bot response: Hello! Welcome to Sparkle Clean...
```

### Browser DevTools
1. Open browser DevTools (F12)
2. Check Console tab for frontend logs
3. Check Network tab for Socket.io connections
4. Check Application tab for permissions

## 🔍 Troubleshooting in VS Code

### Common Issues & Solutions

1. **Port already in use**
   ```bash
   # Find process using port 3000
   lsof -ti:3000
   # Kill the process
   kill -9 <process_id>
   ```

2. **Dependencies issues**
   ```bash
   # Clear npm cache
   npm cache clean --force
   # Reinstall dependencies
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Environment variables not loading**
   - Check `.env` file exists
   - Verify no spaces around `=` in `.env`
   - Restart server after changing `.env`

### VS Code Extensions for Debugging
- **Error Lens** - Shows errors inline
- **Bracket Pair Colorizer** - Color-coded brackets
- **GitLens** - Git integration
- **Auto Rename Tag** - For HTML editing

## 🎯 Project Testing Checklist

### ✅ Backend Testing
- [ ] Server starts without errors
- [ ] Health endpoint responds: `GET http://localhost:3000/health`
- [ ] Socket.io connection established
- [ ] API keys configured correctly

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
- [ ] Error handling works

## 🚀 Quick Commands Reference

```bash
# Project setup
npm install
cp .env.example .env
node setup-check.js

# Development
npm run dev     # Auto-restart server
npm start       # Production server

# Testing
node setup-check.js              # Verify setup
curl http://localhost:3000/health # Test server

# Debugging
npm run dev --verbose  # Verbose logging
```

This guide provides everything needed to set up, develop, and test the voicebot application in VS Code!
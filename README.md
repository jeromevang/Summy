# Summy

Context management middleware for LLM conversations between IDEs and cloud providers.

## Features

- 🖥️ **Proxy Server**: Intercepts IDE ↔ OpenAI traffic
- 💾 **Context Capture**: Saves complete conversation history
- 📝 **WYSIWYG Editor**: Monaco Editor for context management
- 🗜️ **Smart Summarization**: LMStudio integration for context compression
- 🔄 **Session Management**: Save, edit, and reuse conversation contexts

## Quick Start

### Prerequisites
- Node.js 18+
- OpenAI API key
- LMStudio (optional, for summarization)

### Installation

```bash
# Install all dependencies
npm run install:all

# Or manually:
npm install
cd server && npm install
cd ../client && npm install
```

### Development

#### Option 1: Batch Script (Windows)
```bash
# Kill existing processes and start both server & client
start.bat
```

#### Option 2: PowerShell Script
```powershell
# Run with PowerShell (allows Ctrl+C to stop all)
.\start.ps1
```

#### Option 3: Manual Start
```bash
# Terminal 1: Start server
cd server && npm run dev

# Terminal 2: Start client
cd client && npm run dev
```

### URLs
- **Client Interface**: http://localhost:5174
- **Server API**: http://localhost:3001

## Configuration

1. Open http://localhost:5174
2. Go to Settings page
3. Configure:
   - OpenAI API key
   - LMStudio URL (http://localhost:1234)
   - ngrok URL (for IDE integration)

## Usage

1. **Start ngrok**: `ngrok http 3001`
2. **Configure IDE**: Point to ngrok URL
3. **Make requests**: Conversations are automatically captured
4. **Manage contexts**: Use the web interface to view/edit sessions

## Architecture

```
IDE → ngrok → Summy Proxy → OpenAI API
                 ↓
          Context Capture
                 ↓
        JSON Session Storage
```

## Scripts

- `npm start` - Kill processes and start both services
- `npm run kill` - Kill all node processes
- `npm run build` - Build both server and client
- `npm run install:all` - Install dependencies for all components

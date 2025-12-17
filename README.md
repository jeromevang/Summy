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

#### Start Client (Web Interface)
```bash
# Start only the web interface
npm run dev
```
**Opens:** http://localhost:5173 (or next available port)

#### Start Server (API/Proxy)
```bash
# Start the backend server separately
npm run dev:server
# or manually:
cd server && npm run dev
```
**Runs on:** http://localhost:3001

#### Full Development Setup
```bash
# Terminal 1: Start client
npm run dev

# Terminal 2: Start server
npm run dev:server
```

**Server Status:** Check the indicator in the web interface navigation bar.

### URLs
- **Client Interface**: http://localhost:5173
- **Server API**: http://localhost:3001
- **Debug Console**: Check /debug page for live activity

### IDE Setup (One-time)
1. Start server: `npm run dev:server`
2. Start ngrok: `ngrok http 3001`
3. Configure IDE to use ngrok URL instead of OpenAI API
4. Sessions auto-create as you chat!

### Server Management
- **Status**: Green/red indicator in navigation bar
- **Stop**: `npm run kill` (kills all Node processes)
- **Debug**: Check Debug page for live request monitoring

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

- `npm run dev` - Start client (web interface)
- `npm run dev:server` - Start server (API/proxy)
- `npm run kill` - Kill all Node.js processes
- `npm run build` - Build both server and client
- `npm run install:all` - Install dependencies for all components

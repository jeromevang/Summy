# Summy

## Project Overview

**Summy** is a comprehensive context management middleware designed to optimize Large Language Model (LLM) interactions. It acts as a smart proxy between Integrated Development Environments (IDEs) like Cursor or VS Code and AI providers (OpenAI, OpenRouter, etc.).

**Core Mission:** To capture, analyze, and refine the context sent to LLMs, enabling features like session replay, token optimization, and semantic search integration.

### Key Capabilities
- **Traffic Interception:** Proxies requests to capture full conversation history.
- **Context Management:** A "Time Machine" for your coding sessions, allowing you to save, edit, and fork conversation contexts.
- **Visual Interface:** A React-based dashboard for monitoring latency, costs, and model performance.
- **Local Intelligence:** Includes a RAG server and MCP (Model Context Protocol) server for deep integration with local files and tools.

## Architecture

The project is structured as a **Monorepo** using npm workspaces.

| Service | Directory | Tech Stack | Description |
| :--- | :--- | :--- | :--- |
| **Proxy Server** | `server/` | Node.js, Express, SQLite, Vectra | The core backend. Handles request proxying, data persistence, and websocket updates. |
| **Web Client** | `client/` | React, Vite, TailwindCSS, Recharts | The frontend UI. Provides a dashboard for session management and analytics. |
| **MCP Server** | `mcp-server/` | Node.js, TypeScript | Implements the Model Context Protocol. Exposes local tools (FS, Git, Browser) to AI agents. |
| **RAG Server** | `rag-server/` | Node.js, Express, LanceDB | specialized vector search service for semantic code queries and embeddings. |

## Building and Running

### Prerequisites
- **Node.js**: v18+
- **npm**: (Handles workspace management)
- **External Tools**: `ngrok` (for exposing the local proxy to cloud IDEs), `LMStudio` (optional, for local inference/summarization).

### Quick Start (Dev Mode)

To start the entire suite (Server, Client, RAG, and MCP tools) concurrently:

```bash
npm install
npm run dev
```

### Individual Services

If you prefer running services in separate terminals:

**1. Proxy Server (Backend)**
```bash
npm run dev:server
# Runs on http://localhost:3001
```

**2. Web Client (Frontend)**
```bash
npm run dev:client
# Runs on http://localhost:5173
```

**3. RAG Server**
```bash
npm run dev:rag
# Runs on internal port (default 3002)
```

**4. MCP Server**
```bash
npm run dev:mcp
# or
npm run dev:cursor-tools  # Specific for Cursor integration
npm run dev:continue-tools # Specific for Continue integration
```

### Building for Production

```bash
npm run build
# Builds all workspaces
```

## Configuration

- **Environment Variables:** Each service typically uses `.env` files (though `settings.json` is also used in `server/`).
- **Dashboard Settings:** Configure API keys (OpenAI, etc.) and URLs (ngrok, LMStudio) directly in the Client UI (`http://localhost:5173/settings`).
- **MCP Configuration:**
    - Cursor: Update `.cursor/mcp.json` to point to the `mcp-server` script.
    - Continue: Update `~/.continue/config.json` to use the SSE endpoint.

## Development Conventions

- **Language:** **TypeScript** is strictly used across all workspaces (`type: "module"`).
- **Styling:** **TailwindCSS** for the frontend.
- **State Management:** Local state + React Hooks for frontend; SQLite + In-memory objects for backend.
- **Communication:**
    - **HTTP/REST:** Between Client and Server.
    - **WebSockets:** For real-time updates (logs, status).
    - **MCP (Stdio/SSE):** For AI tool communication.
- **Database:** Local-first approach using `better-sqlite3` and `vectra`/`lancedb` for vector storage. No external DB server required.

## Key Files & Paths

- `server/src/index.ts`: Entry point for the Proxy Server.
- `client/src/App.tsx`: Main React component structure.
- `mcp-server/src/server.ts`: Main MCP server implementation.
- `rag-server/src/index.ts`: RAG server entry point.
- `data/summy.db`: Main SQLite database (created at runtime).

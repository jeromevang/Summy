# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Summy is a **local AI "Sidecar Platform"** that manages AI teams, context, and secrets for software projects. It has evolved from a proxy middleware into a comprehensive workspace manager enabling "Self-Improving Agentic Workflows".

**Core Mission:** Allow developers to assemble "Squads" of AI models (Main Architect + Executors + Specialists) that work together on any local codebase, supported by shared memory and semantic intelligence.

**Core Architecture:** Monorepo with PNPM workspaces consisting of:
- **Client**: React 19 + Vite web interface (port 5173)
- **Server**: Express platform with "Tooly" cognitive engine + workspace management (port 3001)
- **RAG Server**: Vector-based semantic code search with LanceDB (port 3002)
- **MCP Server**: Model Context Protocol for tool execution (stdio transport)
- **Database**: Drizzle ORM + SQLite persistence layer
- **Shared Packages**: Common types and utilities (`@summy/shared`, `@summy/types`)

### Key Capabilities

1. **Dynamic Workspace Management (Sidecar Mode):**
   - Switch between projects on the fly using Project Switcher
   - Dynamically re-indexes codebase (RAG) and restarts tools (MCP) per active folder
   - Git Integration: "Safe Mode" prevents file modifications if repo is dirty

2. **Team Builder & Coordination:**
   - Squad Assembly: Define Main Architect (e.g., GPT-4o) + Executor (e.g., DeepSeek-Coder)
   - Specialists: Add custom agents for QA or security
   - Combo Learning: Automatically tests model pairs and generates "Coordination Prosthetics"

3. **API Bridge (External Integration):**
   - RAG Server provides semantic search on active project
   - Exposes endpoints (`/api/rag/query`, `/api/nav/symbols`) for external agents
   - Sources Page: Centralized API key and endpoint management

4. **Refactoring & Memory:**
   - Auto File Splitter tool (`refactor_split_file`)
   - Project-scoped "Prosthetic Prompts" and failure logs per project hash

## Development Commands

### Starting Development

```bash
# Start all services (server, client, rag, mcp) concurrently
npm run dev

# Start individual services
npm run dev:client         # React frontend on port 5173
npm run dev:server         # Express backend on port 3001
npm run dev:rag            # RAG server on port 3002
npm run dev:mcp            # MCP server (stdio)
npm run dev:continue-tools # Continue IDE integration
npm run dev:cursor-tools   # Cursor IDE integration

# Kill all Node processes (Windows)
npm run kill

# TUI Dashboard for monitoring
npm run dashboard
```

### Building

```bash
# Build all workspaces
npm run build

# Build individual workspaces
npm run build:server
npm run build:client
npm run build:mcp
npm run build:rag
```

### Testing

```bash
# Run all tests (Vitest)
npm test

# Watch mode
npm run test:watch

# Individual workspace tests
cd server && npm test
cd client && npm test
```

**Test Configuration:**
- Framework: Vitest (Node environment for server/mcp/rag, jsdom excluded for client)
- Config: `vitest.config.ts` at root
- Aliases: `@server`, `@mcp`, `@rag` for imports

### Installation

```bash
# Install all workspace dependencies
npm run install:all

# Playwright browsers (required for MCP browser tools)
cd mcp-server && npx playwright install chromium
```

## Key Architecture Patterns

### Request Flow

```
IDE (via ngrok)
  → Summy Server (3001)
    → OpenAI API Proxy (intercept/passthrough)
    → Context Capture (SQLite)
    → WebSocket Broadcast (real-time updates)
    → Cognitive Engine (Tooly module)
  → RAG Server (3002) for semantic search
  → MCP Server for tool execution

Client (5173)
  → WebSocket + REST API → Server
```

### Server Architecture (Port 3001)

The main Express server (`server/src/index.ts`) contains:

**Key Modules:**
- `modules/tooly/` - 14,000+ line cognitive engine with subsystems:
  - `cognitive-engine/` - Agentic reasoning loops
  - `context/` - Context summarization and analysis
  - `orchestrator/` - Tool orchestration and combo teaching
  - `providers/` - LLM provider abstraction (OpenAI, LMStudio, Google, Ollama, etc.)
  - `testing/` - Test execution and categorization
  - `learning/` - Model performance learning
  - `prompts/` - Prompt template management

**Routes:**
- `routes/api-bridge.ts` - API bridge functionality
- `routes/sessions.ts` - Session management
- `routes/tooly/*.ts` - Model management, testing, baseline tests
- `routes/rag.ts` - RAG integration
- `routes/system.ts` - System metrics and health

**Services:**
- `services/openai-proxy.js` - OpenAI API proxy with request interception
- `services/tracing.js` - Distributed tracing system
- `services/ws-broadcast.js` - WebSocket broadcasting
- `services/enhanced-logger.js` - Structured logging
- `services/cache/cache-service.js` - Caching layer

### RAG Server Architecture (Port 3002)

Vector-based semantic search service (`rag-server/src/index.ts`):
- **Vector DB**: LanceDB for storage
- **Embeddings**: LMStudio SDK + Google Generative AI
- **File Watching**: Chokidar for auto-indexing
- **Tree-sitter**: Code parsing (JS, TS, Python)

### MCP Server Architecture (stdio)

Tool execution server (`mcp-server/src/server.ts`) with categories:
- File tools (read, write, search)
- Git tools (commit, branch, status)
- NPM tools (install, scripts)
- Browser tools (Playwright automation)
- RAG tools (semantic search)
- System tools (metrics, processes)
- Refactor tools (code transformations)

### Client Architecture (Port 5173)

React SPA (`client/src/main.tsx`) with pages:
- **Dashboard** - Overview and metrics
- **Sessions** - Conversation history
- **Settings** - Configuration
- **Sources** - Centralized API keys and endpoints management (OpenAI, Anthropic, LMStudio, Ollama)
- **Team Builder** - Define AI Squads (Main Architect + Executor + Specialists)
- **Project Switcher** - Dynamic workspace switching
- **ContextEditor** - Monaco editor with Prism visualizer for context editing
- **Tooly** - Model management and combo testing interface
- **RAG** - Vector search interface (GPS Navigator)
- **Debug** - Live activity monitoring with WebSocket

**Tech Stack:**
- React 19 + React Router 7
- Vite build tool
- Tailwind CSS (Cyber-Obsidian theme)
- Monaco Editor
- Recharts for visualizations
- Axios for HTTP, ReconnectingWebSocket for real-time
- SystemHUD - Global system status indicator

### Critical Service Files

**Workspace Management:**
- `server/src/services/workspace-service.ts` - Manages active project state and switching
- `server/src/modules/tooly/mcp-client.ts` - Spawns/restarts MCP with dynamic cwd

**UI Components:**
- `client/src/pages/TeamBuilder.tsx` - Squad assembly UI
- `client/src/pages/Sources.tsx` - API keys and endpoints
- `client/src/components/useContextPrism.tsx` - Context visualization

**RAG System:**
- `rag-server/src/server/RAGServer.ts` - Semantic search backend
- `rag-server/src/embeddings/gemini.ts` - Google Gemini embeddings provider

## Important File Locations

### Configuration
- `.env` - Environment variables (API keys, URLs)
- `settings.json` - Runtime server configuration
- `drizzle.config.ts` - Database schema configuration
- `models.json` - LLM models catalog

### Memory System (from .cursorrules)
- `WORKING_MEMORY.md` - Project-specific context (check this first!)
- `C:/Users/Jerome/GLOBAL_MEMORY.md` - Cross-project user preferences

### Database
- `database/src/schema.ts` - Drizzle ORM schema definitions
- `database/` - SQLite database files

### Data Storage
- `data/` - Runtime data files (sessions, contexts, embeddings)

## TypeScript Configuration

**Monorepo Setup:**
- Root `tsconfig.json` with project references
- Each workspace has its own `tsconfig.json`
- Target: ES2020-ES2022
- Module: NodeNext for server, ES2020 for others
- Strict mode enabled across all workspaces

**Path Aliases (test only):**
```typescript
'@server' → './server/src'
'@mcp' → './mcp-server/src'
'@rag' → './rag-server/src'
```

## Workspace Dependencies

Workspaces use `workspace:*` protocol for internal dependencies:
- All workspaces depend on `@summy/shared` for common types
- MCP server depends on `@summy/database`
- Use `pnpm` for dependency management

## IDE Integration

**Setup for capturing IDE conversations:**
1. Start server: `npm run dev:server`
2. Start ngrok tunnel: `ngrok http 3001`
3. Configure IDE (Cursor/Continue) to use ngrok URL as OpenAI endpoint
4. Sessions auto-create as conversations occur

**Debug monitoring:**
- Web UI Debug page shows live requests/WebSocket activity
- Server TUI dashboard: `npm run dashboard`

## Coding Standards (from .cursorrules)

- Use TypeScript for all new code
- Prefer functional components with hooks in React
- Use async/await over promise chains
- Error handling should be explicit
- Follow existing patterns in each workspace

## Key Workflows

### The Sidecar Workflow

1. User launches Summy: `npm run dev`
2. Navigate to `localhost:5173`
3. **Project Switcher**: Select target folder (e.g., `C:/Projects/MyApp`)
4. **Backend automatically**:
   - `WorkspaceService` updates active project path
   - `MCPClient` restarts tool server in that folder
   - `RAGServer` starts indexing that folder
5. **Team Builder**: Select "GPT-4o" as Architect and "Local Model" as Executor
6. User/Agent interacts with system; models use tools on target repo safely

### The API Bridge Workflow (External Integration)

**Goal**: Allow external CLI agents (like Gemini) to query Summy's RAG index

**Steps**:
1. Summy exposes `GET /api/bridge/info`
2. User copies "System Prompt Snippet" from Sources Page
3. External agent uses prompt to call `POST /api/rag/query` for semantic code search
4. Agent can find relevant code in user's project without direct file access

**Key Endpoints**:
- `GET /api/bridge/info` - Bridge configuration
- `POST /api/rag/query` - Semantic search
- `GET /api/nav/symbols` - Symbol navigation

### Project-Scoped Data

Configuration and memories are stored per-project:
- **Team Configs**: `server/data/teams.json`
- **Prosthetic Prompts**: `server/data/projects/<hash>/prosthetics.json`
- **Failure Logs**: `server/data/projects/<hash>/failures.json`

This prevents context pollution when switching between projects.

## Context Management Protocol

When working in this codebase:
1. **Always check** `WORKING_MEMORY.md` first (project context)
2. **Check** `C:/Users/Jerome/GLOBAL_MEMORY.md` for user preferences
3. **Update** `WORKING_MEMORY.md` and `GEMINI.md` when:
   - Task completes (automatically, without prompting)
   - Significant structural changes occur
   - Conversation exceeds 5-10 turns
   - Before switching tasks
   - At natural stopping points

## Common Patterns

### Server Development
- Server uses ES modules (`"type": "module"`)
- Watch mode: `tsx watch src/index.ts`
- Build: `tsc` outputs to `dist/`
- Express routes follow REST conventions

### Client Development
- Vite dev server with HMR
- Proxy configuration in `vite.config.ts` for `/api` and `/ws` endpoints
- Components in `client/src/components/`
- Pages in `client/src/pages/`

### Database Operations
- Drizzle ORM with better-sqlite3
- Schema generation: `cd database && npx drizzle-kit generate`
- Push migrations: `cd database && npx drizzle-kit push`

### WebSocket Communication
- Server broadcasts on `ws://localhost:3001`
- Client uses `reconnecting-websocket` for resilience
- Real-time updates for sessions, traces, system metrics

## Operational Protocols

### Safe Server Startup (Windows/PowerShell)

When starting long-running Node.js servers without blocking or risking termination:

**Important Rules:**
1. **Never run blocking commands** like `npm run dev` directly in CLI - it will hang the interface
2. **Use `Start-Process`** to launch in separate hidden window with output redirection:
   ```powershell
   Start-Process powershell -ArgumentList '-NoProfile', '-Command', 'npm run dev > server.out 2> server.err' -WindowStyle Hidden
   ```
3. **Monitor logs on demand** (don't use `-Wait`):
   ```powershell
   Get-Content -Tail 20 server.out
   ```
4. **Cleanup first**: Check for and kill conflicting processes before starting:
   ```powershell
   Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
   Get-Process node -ErrorAction SilentlyContinue | Stop-Process
   ```

### Recent Changes (from WORKING_MEMORY.md)

- Frontend Phase 1 complete: Swarm Hub & Cyber-Obsidian theme, SystemHUD integrated
- Frontend Phase 2 complete: The Prism context visualization components
- Frontend Phase 5 complete: RAG & GPS Navigator page
- Disabled `verbatimModuleSyntax` in `client/tsconfig.json` for mixed imports
- Sidecar Platform pivot: centralized Sources/Secrets, Team Builder, dynamic project switching
- Ollama support integrated: ServerSettings updated, UI components added in Sources page

## Branch Information

- **Main branch**: `master`
- **Current branch**: `fix-ts-errors-and-refactors`
- Recent work focused on TypeScript error resolution and code refactoring
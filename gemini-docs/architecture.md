# Summy: Local AI Platform - Architecture

## Architecture
The project is structured as a **Monorepo** using npm workspaces.

| Service | Directory | Description |
| :--- | :--- | :--- |
| **Proxy Server** | `server/` | The core platform logic. Handles Workspace switching, Team persistence, and API bridging. |
| **Web Client** | `client/` | React/Vite dashboard. Now includes "Sources", "Team Builder", and "Project Switcher". |
| **MCP Server** | `mcp-server/` | Provides filesystem/git tools. Spawns as a child process with dynamic `cwd` based on the active project. |
| **RAG Server** | `rag-server/` | Vector search engine (LanceDB). Watches the active project folder for changes. |
| **Database** | `database/` | Shared logic for AST parsing and code analysis. |

## Building and Running

### Quick Start
```bash
npm install
npm run dev
# Starts Server (3001), Client (5173), RAG (3002), and prepares MCP.
```

### Configuration
*   **API Keys:** Manage them in the UI (**Sources** page). They are persisted to `settings.json`.
*   **Team Configs:** Saved per-project in `server/data/teams.json`.
*   **Memories:** Saved per-project in `server/data/projects/<hash>/`.

## Key Files
*   `server/src/services/workspace-service.ts`: Manages active project state.
*   `server/src/modules/tooly/mcp-client.ts`: Handles spawning/restarting the MCP tool server.
*   `client/src/pages/TeamBuilder.tsx`: UI for defining model squads.
*   `rag-server/src/server/RAGServer.ts`: The semantic search API backend.
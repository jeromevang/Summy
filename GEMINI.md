# Summy: Local AI Platform

## Project Overview

**Summy** is a local "Sidecar Platform" designed to manage AI teams, context, and secrets for software projects. It has evolved from a simple proxy middleware into a comprehensive workspace manager that enables "Self-Improving Agentic Workflows".

**Core Mission:** To allow developers to assemble "Squads" of AI models (Main Architect + Executors + Specialists) that work together on any local codebase, supported by a shared memory and semantic intelligence layer.

### Key Capabilities

1.  **Dynamic Workspace Management (Sidecar Mode):**
    *   Summy can switch between different projects on the fly using the **Project Switcher**.
    *   It dynamically re-indexes the codebase (RAG) and restarts tools (MCP) to match the active folder.
    *   **Git Integration:** "Safe Mode" prevents agents from modifying files if the git repo is dirty.

2.  **Team Builder & Coordination:**
    *   **Squad Assembly:** Define a **Main Architect** (e.g., GPT-4o for planning) and an **Executor** (e.g., DeepSeek-Coder for file ops).
    *   **Specialists:** Add custom agents for QA or security auditing.
    *   **Combo Learning:** The system automatically tests model pairs and generates "Coordination Prosthetics" to fix handoff failures.

3.  **Local Intelligence (The API Bridge):**
    *   **RAG Server:** A semantic search engine that indexes the active project.
    *   **API Bridge:** Exposes endpoints (`/api/rag/query`, `/api/nav/symbols`) so *external* agents (like Gemini CLI) can tap into Summy's index.
    *   **Sources Page:** Centralized management for API Keys (OpenAI, Anthropic) and Local Endpoints (LM Studio, Ollama).

4.  **Refactoring & Tooling:**
    *   **Auto File Splitter:** An explicit tool (`refactor_split_file`) for breaking large files into modules.
    *   **Project-Scoped Memory:** "Prosthetic Prompts" (fixes for model bugs) and "Failure Logs" are saved specifically for each project hash, preventing context pollution.

## Architecture

The project is structured as a **Monorepo** using npm workspaces.

| Service | Directory | Description |
| :--- | :--- | :--- |
| **Proxy Server** | `server/` | The core platform logic. Handles Workspace switching, Team persistence, and API bridging. |
| **Web Client** | `client/` | React/Vite dashboard. Now includes "Sources", "Team Builder", and "Project Switcher". |
| **MCP Server** | `mcp-server/` | Provides filesystem/git tools. Spawns as a child process with dynamic `cwd` based on the active project. |
| **RAG Server** | `rag-server/` | Vector search engine (LanceDB). Watches the active project folder for changes. |
| **Database** | `database/` | Shared logic for AST parsing and code analysis. |

## Key Concepts & Workflows

### 1. The "Sidecar" Workflow
1.  User launches Summy (`npm run dev`).
2.  User navigates to `localhost:5173`.
3.  **Project Switcher:** User selects a target folder (e.g., `C:/Projects/MyApp`).
4.  **Backend:**
    *   `WorkspaceService` updates the path.
    *   `MCPClient` restarts the tool server in that folder.
    *   `RAGServer` starts indexing that folder.
5.  **Team Builder:** User selects "GPT-4o" as Architect and "Local Model" as Executor.
6.  **Action:** User (or Agent) interacts with the system; models use tools on the target repo safely.

### 2. The API Bridge (External Integration)
*   **Goal:** Allow a CLI agent (like Gemini) to "see" the project Summy is managing.
*   **Mechanism:**
    *   Summy exposes `GET /api/bridge/info`.
    *   User copies the "System Prompt Snippet" from the **Sources Page**.
    *   External Agent uses this prompt to know how to call `POST /api/rag/query` to find code in the user's project.

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


## Gemini Added Memories
- Always automatically update WORKING_MEMORY.md and GEMINI.md after completing significant tasks or structural changes without being prompted.
- Frontend Phase 1 (Swarm Hub & Cyber-Obsidian Theme) is complete. SystemHUD is integrated globally. Backend /status endpoint updated.
- Disabled 'verbatimModuleSyntax' in client/tsconfig.json to allow mixed value/type imports without explicit 'import type'.
- Frontend Phase 2 (The Prism) is complete. Context visualization components (useContextPrism, PrismVisualizer, SplitHorizon) are implemented and integrated into ContextEditor. Path aliases configured.
- Frontend Phase 5 (RAG & GPS Navigator) is complete. Dedicated page for semantic code search and codebase indexing status has been implemented.
- We are pivoting Summy's architecture to a "Sidecar Platform" model. Key changes: 1. Centralized Sources/Secrets page. 2. "Team Builder" (Main/Executor/Agents) replacing Dual Mode. 3. Dynamic Project Switching (arbitrary directories). 4. Unifying Middleware/Standalone modes into one Platform.
- Integrated Ollama support into the Summy platform. This includes updating the ServerSettings interface and ProviderSchema in @summy/shared, modifying server-side settings loading and default values, and adding UI components for Ollama configuration in the Sources page. The @summy/shared package was rebuilt and useSources hook was updated to reflect the new ServerSettings import path.
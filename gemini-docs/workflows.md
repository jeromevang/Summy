# Summy: Local AI Platform - Key Concepts & Workflows

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
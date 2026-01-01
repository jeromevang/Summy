# Summy Evolution: Local AI Platform

**Status:** Planning / Architecture Shift
**Date:** Jan 1, 2026
**Goal:** Transform Summy from a project-specific utility into a standalone "Sidecar" platform that manages AI teams, context, and secrets for *any* project.

---

## 1. Core Architectural Pillars

### A. Centralized "IT Dept" (Sources & Secrets)
*   **Problem:** API keys and provider settings are currently scattered or hardcoded per session.
*   **Solution:** A dedicated **Sources** page.
*   **Capabilities:**
    *   Manage Credentials: Store OpenAI, Anthropic, Gemini, OpenRouter keys securely.
    *   Manage Local Endpoints: Configure LM Studio, Ollama, vLLM ports.
    *   **New:** "Gemini CLI" Bridge (Allowing the CLI to register as a source/tool).

### B. "Team Builder" Architecture
*   **Problem:** "Dual Mode" is too rigid. Complex tasks need specialized roles.
*   **Solution:** A **Team Configuration** interface replacing the simple Model Selector.
*   **Roles:**
    1.  **🧠 Main (The Architect) - MANDATORY:**
        *   High reasoning (e.g., GPT-4o, Claude 3.5).
        *   Holds the "Big Picture" plan.
        *   Orchestrates and delegates.
    2.  **⚡ Executor (The Engineer) - OPTIONAL:**
        *   High speed/coding proficiency (e.g., DeepSeek-Coder, Local Models).
        *   Receives specific, isolated tasks ("Fix auth.ts").
        *   Uses tools (FileSystem, Git).
    3.  **🕵️ Specialists (Agents) - OPTIONAL:**
        *   Task-specific agents (e.g., "Security Auditor", "QA Tester", "Docs Researcher").
        *   Can use specialized prompts or distinct models.

### C. Project Portability (The Sidecar Model)
*   **Problem:** Summy currently assumes it lives inside the target project's `node_modules` or root.
*   **Solution:** Summy runs as a Global App (Standalone).
*   **Mechanism:**
    *   **Project Selector:** UI to "Open Folder".
    *   **Dynamic Indexing:** RAG/AST services spin up for the *selected* directory, not Summy's own directory.
    *   **Context Isolation:** Profiles and Memories are scoped to the specific Project ID.

### D. Universal Intelligence (GPS/RAG API)
*   **Goal:** Allow external agents (like the Gemini CLI user is using) to tap into Summy's brain.
*   **Implementation:**
    *   Expose `GET /api/rag/query` and `GET /api/nav/symbols` as public endpoints.
    *   Provide a "System Prompt Snippet" that users can paste into their other agents:
        > "You have access to the Summy RAG API at http://localhost:3002..."

---

## 2. Middleware vs. Standalone?

**Decision:** **Unification.**
We will not maintain two separate modes.
*   **Summy IS the Platform.**
*   It runs independently (Standalone).
*   It *provides* Middleware services (Proxying requests) to any IDE that connects to it.
*   Whether you use it via Cursor (as a proxy) or via the Web UI (as a manager), the backend logic is the same "Sidecar".

---

## 3. Implementation Phases

### Phase 1: Sources & Teams (Frontend Heavy)
*   [ ] Create `Sources` Page (Key/Provider Management).
*   [ ] Create `Team Builder` Page (Role assignment).
*   [ ] Refactor `AgenticReadiness` to use the Team config instead of hardcoded selects.

### Phase 2: Project Manager (Backend Heavy)
*   [ ] Implement `WorkspaceService` in backend.
*   [ ] Create "Project Switcher" in UI (Header/Sidebar).
*   [ ] Update RAG/MCP services to accept a `targetDir` parameter instead of using `process.cwd()`.

### Phase 3: The API Bridge
*   [ ] Secure/Document the RAG endpoints.
*   [ ] Create the "Bridge" prompt for external agents.

---

## 4. Immediate Next Steps (User Direction)
1.  Approve this plan.
2.  Begin Phase 1 (UI screens for Sources and Teams).

# Summy: Local AI Platform - Overview

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
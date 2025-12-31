# Summy: The Command Center for Agentic AI Development
## Frontend Overhaul & Service Integration Plan

Summy is evolving from a utility middleware into a **Stateful Agentic Proxy Service**. This plan outlines the complete frontend overhaul to transform the current interface into a professional, high-density "Command Center" designed for developers.

---

## 1. Core Vision: The IDE/CLI "Brain" Service
By running Summy as a service, local IDEs (Cursor/VS Code) and CLIs gain capabilities they cannot achieve standalone.

### A. Surgical Codebase Awareness (GPS Benefit)
*   **The Problem:** Standard IDE extensions often send too much or too little code context, leading to "Lost in the Middle" errors or hallucinated paths.
*   **Summy Benefit:** The GPS (Code Index) and RAG servers provide **surgical context injection**. Summy identifies the exact symbols and dependencies needed for a prompt and injects them as high-density snippets before the prompt hits the LLM.
*   **Frontend Support:** A **GPS Explorer** allows developers to see what symbols are currently "in focus" and how they are linked in the dependency graph.

### B. Infinite, Compressed Memory (Prism Benefit)
*   **The Problem:** Conversations eventually bloat, becoming slow and expensive.
*   **Summy Benefit:** The **Context Prism** manages the token budget. It keeps the System Prompt and recent turns full-fidelity while aggressively summarizing the middle of the conversation into "Key Facts."
*   **Frontend Support:** A **Visual Context Meter** shows the real-time breakdown of the context window (System vs. RAG vs. Memory vs. History).

### C. Self-Healing Model Loops (Prosthetic Benefit)
*   **The Problem:** Models often fail on the same patterns (e.g., malformed JSON, recursive search loops).
*   **Summy Benefit:** The **Controller** detects failure patterns and auto-applies **Prosthetics** (Level 1-4 prompts). The model literally "gets smarter" during the session.
*   **Frontend Support:** A **Prosthetic Sandbox** where users can review, edit, and live-test compensation prompts.

---

## 2. Frontend Module Breakdown

### Module 1: The Swarm Hub (Source & Model Selection)
*   **Goal:** Replace the 3/4 split layout with a **full-width intelligence dashboard**.
*   **Features:**
    *   **High-Density Model Grid:** Visual cards for LMStudio, OpenRouter, and OpenAI models.
    *   **Provider Pulse:** Real-time health status of local (LMStudio) vs. cloud providers.
    *   **Quick-Toggle Roles:** One-click assignment of "Main" (Reasoning) and "Executor" (Tools) roles.
    *   **Hardware Telemetry:** Global VRAM/GPU usage monitoring in the header.

### Module 2: The Context Prism (Visual Session Debugger)
*   **Goal:** Evolve the `ContextEditor` into a visual "Time Machine."
*   **Features:**
    *   **Split-Horizon View:** Left side shows the IDE's raw traffic; right side shows Summy's "Surgical Version" (the one actually sent to the LLM).
    *   **Attribution Heatmap:** Highlight text in the response to see exactly which RAG chunk or Memory fact generated it.
    *   **Compression Stepper:** Interactively adjust the compression level (None -> Aggressive) and see the token count drop in real-time.

### Module 3: Agentic Lab (Model Detail 2.0)
*   **Goal:** A dedicated page for deep-diving into a single model's "DNA."
*   **Features:**
    *   **Capability Radar:** Tool use, RAG priority, Reasoning depth, and Intent accuracy.
    *   **Context Degradation Curve:** A line chart showing where the model's quality "cliffs" occur (e.g., "Performance drops after 18k tokens").
    *   **Prosthetic Editor:** A Monaco-based editor to fine-tune the model's compensation prompts.

### Module 4: The System Controller (Improvement Feed)
*   **Goal:** The "AI for the AI" dashboard.
*   **Features:**
    *   **Failure Pattern Recognition:** Auto-grouped clusters of errors (e.g., "Qwen-32B consistently fails at `edit_file` paths").
    *   **Intervention Log:** A timeline of when Summy intervened to fix a model's mistake.
    *   **Auto-Teach Progress:** Track the model's improvement over time across assessment cycles.

### Module 5: RAG & GPS Navigator
*   **Goal:** Visibility into the codebase index.
*   **Features:**
    *   **Symbol Search:** Instant lookup of functions/classes across the 491+ indexed files.
    *   **Dependency Graph:** Interactive visualization of how modules connect.
    *   **Index Health:** Real-time feedback on GPS sync status.

---

## 3. UI/UX Specification

### Design Language: "Cyber-Obsidian"
*   **Background:** Deep black (`#050505`) with subtle dark grey (`#0d0d0d`) paneling.
*   **Borders:** `white/5%` with glowing accents.
*   **Color Palette:**
    *   `#06b6d4` (Cyan) - GPS & Code Index
    *   `#8b5cf6` (Purple) - LLM & Reasoning
    *   `#10b981` (Emerald) - RAG & Success
    *   `#f59e0b` (Amber) - Failures & Interventions
*   **Typography:** Inter for UI; JetBrains Mono for code and logs.

### Navigation & Interaction
*   **Command-K Menu:** Global search to jump to models, sessions, or RAG symbols.
*   **Glow-States:** Panel borders pulse when that system is active (e.g., Emerald glow during RAG search).
*   **Micro-Dashboard Header:** A sticky header bar showing [CPU] [GPU] [VRAM] [Current Swarm] regardless of the page.

---

## 4. Implementation Phasing

1.  **Phase 1: Foundation (Layout & Routing)**
    *   Implement the full-width high-density layout using React + Tailwind.
    *   Overhaul the "Source Selection" (Swarm Hub) as the primary entry point.
2.  **Phase 2: The Prism (Context Visualization)**
    *   Extract `ContextEditor` logic into a global `useContextPrism` hook.
    *   Build the interactive window fill visualizer.
3.  **Phase 3: The Lab (Analytics & Prosthetics)**
    *   Connect backend failure logs to the Frontend pattern cards.
    *   Implement the Context Degradation line charts.
4.  **Phase 4: Service Integration (The HUD)**
    *   Enable the "Simulation Mode" (Cognitive HUD) for real-time thought tracing of the CLI/IDE proxy traffic.

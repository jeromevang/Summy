# Summy Project Documentation

This `GEMINI.md` now serves as an index for the modular documentation.

To load specific sections, use the `read_file` tool on the following paths within the `gemini-docs/` directory:

- `gemini-docs/overview.md`: Project overview, core mission, key capabilities.
- `gemini-docs/architecture.md`: Architecture, monorepo structure, service descriptions, key files.
- `gemini-docs/workflows.md`: Key concepts and workflows (Sidecar, API Bridge).
- `gemini-docs/operational_protocols.md`: Operational guidelines and safe server startup.

## Gemini Added Memories
- Always automatically update WORKING_MEMORY.md and GEMINI.md after completing significant tasks or structural changes without being prompted.
- Frontend Phase 1 (Swarm Hub & Cyber-Obsidian Theme) is complete. SystemHUD is integrated globally. Backend /status endpoint updated.
- Disabled 'verbatimModuleSyntax' in client/tsconfig.json to allow mixed value/type imports without explicit 'import type'.
- Frontend Phase 2 (The Prism) is complete. Context visualization components (useContextPrism, PrismVisualizer, SplitHorizon) are implemented and integrated into ContextEditor. Path aliases configured.
- Frontend Phase 5 (RAG & GPS Navigator) is complete. Dedicated page for semantic code search and codebase indexing status has been implemented.
- We are pivoting Summy's architecture to a "Sidecar Platform" model. Key changes: 1. Centralized Sources/Secrets page. 2. "Team Builder" (Main/Executor/Agents) replacing Dual Mode. 3. Dynamic Project Switching (arbitrary directories). 4. Unifying Middleware/Standalone modes into one Platform.
- Integrated Ollama support into the Summy platform. This includes updating the ServerSettings interface and ProviderSchema in @summy/shared, modifying server-side settings loading and default values, and adding UI components for Ollama configuration in the Sources page. The @summy/shared package was rebuilt and useSources hook was updated to reflect the new ServerSettings import path.
- Verified CLAUDE.md on 2026-01-07 and confirmed GEMINI.md is consistent with recent project changes.
# @summy/mcp-server

## Project Overview

This project implements a **Model Context Protocol (MCP)** server suite. It provides a rich set of tools for AI assistants to interact with the local file system, git repositories, web browsers, and system processes.

It is designed to be used by MCP-compliant clients such as:
- **Tooly** (The primary target)
- **Cursor** (via `stdio` transport)
- **Continue** (via `SSE` transport)
- **Claude Desktop** (via `stdio` transport)

## Architecture

The project is built with **Node.js** and **TypeScript**. It provides multiple entry points depending on the intended use case:

1.  **Main Server (`src/server.ts`)**:
    -   The core server containing the most comprehensive toolset (~73 tools).
    -   Includes File System, Git, NPM, Browser (Playwright), Memory, and Code Execution tools.
    -   Uses `stdio` transport by default.
    -   *Best for:* General-purpose AI agents needing full system control.

2.  **Standalone Server (`src/standalone.ts`)**:
    -   Wraps the **Main Server** in an Express application.
    -   Exposes the MCP protocol via **Server-Sent Events (SSE)**.
    -   Default Port: `3005`.
    -   *Best for:* Remote clients or clients that prefer HTTP/SSE over stdio.

3.  **Cursor Extra Tools (`src/cursor-extra-tools.ts`)**:
    -   A specialized subset of tools optimized for the **Cursor** editor.
    -   Adds system info, clipboard access, and RAG capabilities.
    -   Uses `stdio` transport.
    -   *Best for:* Integration into Cursor's `mcpServers` configuration.

4.  **Continue Extra Tools (`src/continue-extra-tools.ts`)**:
    -   A specialized subset for the **Continue** VS Code extension.
    -   Similar to Cursor tools but adds VS Code-specifics like `npm_scripts`.
    -   Uses **SSE** transport (Port `3006` default).
    -   *Best for:* Integration into Continue's `config.json`.

### RAG Integration
All servers invoke an external RAG (Retrieval-Augmented Generation) server for semantic code search.
-   **Endpoint:** Expects a RAG server running at `http://localhost:3002` (configurable via `RAG_SERVER_URL`).
-   **Capabilities:** `rag_query`, `rag_status`, `rag_index`, `find_symbol`, `get_callers`, etc.

## Key Features & Tools

### 1. File System Operations
-   Full CRUD: `read_file`, `write_file`, `edit_file` (patch), `delete_file`, `copy_file`, `move_file`.
-   Exploration: `list_directory`, `search_files` (respects `.gitignore`).
-   Metadata: `get_file_info`.

### 2. Git Integration
-   Status & History: `git_status`, `git_log`, `git_diff`, `git_blame`.
-   Management: `git_init`, `git_add`, `git_commit`, `git_push`, `git_pull`.
-   Branching: `git_branch_create`, `git_checkout`, `git_branch_list`.

### 3. Browser Automation (Playwright)
-   Navigation: `browser_navigate`, `browser_go_back/forward`.
-   Interaction: `browser_click`, `browser_type`, `browser_hover`, `browser_drag`.
-   Extraction: `browser_fetch_content` (HTML to text), `browser_take_screenshot`.
-   State: `browser_console_messages`, `browser_network_requests`.

### 4. Code Intelligence (RAG)
-   **`rag_query`**: Semantic search ("Where is authentication handled?").
-   **`find_symbol`**: Locate functions/classes.
-   **`get_callers`**: Find usage references.
-   **`get_file_interface`**: Analyze file exports/imports.

### 5. System & Utilities
-   **Processes**: `process_list`, `process_kill`.
-   **Memory**: `memory_store`, `memory_retrieve` (Persistent JSON storage).
-   **NPM**: `npm_install`, `npm_run`, `npm_list`.
-   **Web Search**: `web_search` (DuckDuckGo).
-   **Clipboard**: `clipboard_read`, `clipboard_write` (Extra tools only).

## Building and Running

### Prerequisites
-   Node.js (v18+ recommended)
-   npm

### Installation
```bash
npm install
```

### Scripts

| Command | Description |
| :--- | :--- |
| `npm run build` | Compiles TypeScript to `dist/`. |
| `npm start` | Runs the compiled main server (`dist/server.js`). |
| `npm run dev` | Runs the **Main Server** (stdio) using `tsx`. |
| `npm run dev:standalone` | Runs the **Standalone SSE Server** on port 3005. |
| `npm run dev:cursor-tools` | Runs the **Cursor Extra Tools** server (stdio). |
| `npm run dev:continue-tools` | Runs the **Continue Extra Tools** server (SSE port 3006). |

### Configuration Examples

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "summy-tools": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/cursor-extra-tools.js"],
      "env": {
        "RAG_SERVER_URL": "http://localhost:3002"
      }
    }
  }
}
```

#### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "summy-main": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/mcp-server/src/server.ts"]
    }
  }
}
```

## Development Conventions

-   **Transport:** Use `StdioServerTransport` for local CLI integration (Cursor, Claude) and `SSEServerTransport` for HTTP-based tools (Continue).
-   **Validation:** All tool inputs are validated using `zod` schemas.
-   **Security:**
    -   File operations are restricted to the project root.
    -   Dangerous shell commands are blocked in `shell_exec`.
-   **Error Handling:** Tools return structured error results rather than throwing exceptions to ensure the MCP connection remains stable.

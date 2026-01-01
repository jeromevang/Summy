# Summy API Bridge

This document details the functionality and usage of the Summy API Bridge. The bridge allows external agents and tools to interact with the currently active project within the Summy platform, providing access to its semantic index and codebase analysis capabilities.

*This document is intended to be a living document. It will be updated as the API bridge evolves.*

## 1. Overview

The primary purpose of the API Bridge is to expose Summy's context-aware intelligence to external consumers. It acts as a discovery service, providing the necessary information for an external tool to connect to the correct endpoints for code analysis.

When a user selects a project in the Summy dashboard, backend services like the RAG server (running on a separate port) index that project's codebase. The API Bridge provides the connection details for these services.

## 2. Endpoints

### 2.1 Discovery: Get Bridge Info

This is the primary discovery endpoint for external agents.

- **Endpoint:** `GET http://localhost:3001/api/bridge/info`
- **Description:** Provides essential information for an external agent to connect and interact with Summy's services. It returns the status, a list of service endpoints, and a pre-formatted system prompt snippet to instruct an AI model on how to use them.
- **Usage:** This should be the first endpoint an external agent calls to understand the active context and discover other services.

**Example Request:**
```bash
curl http://localhost:3001/api/bridge/info
```

**Example Response (Actual):**
```json
{
  "status": "active",
  "endpoints": {
    "rag": "http://localhost:3002/api/rag",
    "nav": "http://localhost:3002/api/nav",
    "workspace": "http://localhost:3001/api/workspace"
  },
  "systemPromptSnippet": "You have access to the Summy RAG API for this project.\nTo search the codebase semantically or find symbols, use the following tools/endpoints:\n\nBase URL: http://localhost:3002\n\n1. Semantic Search:\n   POST /api/rag/query\n   Body: { \"query\": \"your search query\" }\n\n2. Navigation (Symbol Lookup):\n   GET /api/nav/symbols?query=symbolName\n\n3. Workspace Info:\n   GET http://localhost:3001/api/workspace\n\nUse these endpoints to ground your answers in the actual codebase."
}
```

### 2.2 RAG: Semantic Code Search

This endpoint is part of the **RAG Server**, typically running on port 3002.

- **Endpoint:** `POST http://localhost:3002/api/rag/query`
- **Description:** Performs a semantic search (Retrieval-Augmented Generation) query against the indexed codebase of the active project.
- **Usage:** Used to find relevant code snippets based on a natural language question.

**Request Body:**
```json
{
  "query": "How is the user session managed?",
  "limit": 5
}
```
- `query` (string, required): The natural language query.
- `limit` (number, optional): The maximum number of results to return. Defaults to 5.


**Example Request:**
```bash
curl -X POST http://localhost:3002/api/rag/query \
     -H "Content-Type: application/json" \
     -d '{"query": "How is the user session managed?", "limit": 3}'
```

**Example Response:**
```json
{
  "results": [
    {
      "filePath": "server/src/auth/session.ts",
      "score": 0.89,
      "snippet": "export function manageSession(user) {\n  // ... implementation ...\n}"
    }
  ],
  "query": "How is the user session managed?"
}
```

### 2.3 Navigation: Symbol Search

This endpoint is also part of the **RAG Server**.

- **Endpoint:** `GET http://localhost:3002/api/nav/symbols`
- **Description:** Searches for code symbols (functions, classes, variables) within the active project.
- **Usage:** Useful for quickly locating specific definitions in the codebase.

**Query Parameters:**
- `query` (string, required): The name of the symbol to search for.
- `limit` (number, optional): The maximum number of results to return. Defaults to 10.

**Example Request:**
```bash
curl "http://localhost:3002/api/nav/symbols?query=RAGServer&limit=2"
```

**Example Response:**
```json
{
  "symbols": [
    {
      "name": "RAGServer",
      "kind": "class",
      "filePath": "rag-server/src/server/RAGServer.ts",
      "position": {
        "line": 13,
        "character": 1
      }
    }
  ]
}
```

## 3. Integration Workflow (for External Agents)

1.  **Discover:** The agent calls `GET http://localhost:3001/api/bridge/info` to check if Summy is active and get the correct endpoints for other services.
2.  **Incorporate:** The agent incorporates the `systemPromptSnippet` into its own system prompt. This informs the AI model that it has the capability to query the local codebase using specific tools or HTTP requests.
3.  **Query:** When the user asks a question about their code, the agent's model can then use a tool that makes a `POST` request to the RAG server's `/api/rag/query` endpoint or a `GET` request to the `/api/nav/symbols` endpoint.
4.  **Respond:** The agent uses the results from the query to formulate its answer to the user.

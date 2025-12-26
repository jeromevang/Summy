# WORKING_MEMORY

## Current Goal
LanceDB Vector Store Migration - COMPLETED ✅

## Session Summary (Dec 26, 2024)

### LanceDB Migration ✅ (MAJOR)
**Replaced SQLite brute-force vector search with LanceDB ANN search**

- **Before:** O(n) brute-force cosine similarity in SQLite BLOBs
- **After:** O(log n) approximate nearest neighbor with LanceDB

Changes:
- Created `rag-server/src/storage/lancedb-store.ts`
- Uses `@lancedb/lancedb` package (v0.23.0)
- Uses `makeArrowTable` with `vectorColumns` option for proper schema
- Vector column auto-detected as `vector` field (number[])
- Replaced all `getSQLiteVectorStore` calls with `getLanceDBStore`
- Data stored in `rag-server/data/indices/lance/`

Key learnings:
- LanceDB needs `number[]` not `Float32Array` for proper vector detection
- Use empty strings instead of null for string fields
- `vectorSearch()` method for explicit vector queries

### Previous Session Summary

### Major Changes This Session

#### 1. Combo Test Persistence ✅
- Results saved to SQLite database (`combo_test_results` table)
- Auto-update on re-run (UPSERT)
- Load saved results on page mount
- Clear results button added

#### 2. SQLite Vector Store ✅ (MAJOR)
- **Replaced Vectra (JSON) with SQLite**
- No more "Unexpected end of JSON input" errors
- Vectors stored as BLOBs (4 bytes/float)
- ACID transactions, WAL mode
- File: `rag-server/src/storage/sqlite-store.ts`

#### 3. Code-Aware RAG Database ✅ (MAJOR)
New tables for code intelligence:
- `modules` - Directory/module tracking
- `symbols` - Functions, classes, interfaces, types
- `relationships` - Calls, imports, extends, uses
- `file_dependencies` - File-level imports

Symbol fields: name, qualifiedName, type, signature, docComment, visibility, isExported, isAsync, isStatic

#### 4. Automatic Context Enrichment ✅
RAG queries now auto-include related context:
- Related symbols (callers/callees)
- Dependent files
- File exports
- Works for: graph, summary, hybrid strategies

#### 5. MCP Code-Aware Tools ✅
New tools for all MCP servers:
- `find_symbol` - Search functions, classes by name
- `get_callers` - Find what calls a function
- `get_file_interface` - Get exports/imports/dependents
- `get_dependencies` - File-level dependencies
- `get_code_stats` - Codebase statistics

Added to: server.ts, cursor-extra-tools.ts, continue-extra-tools.ts

### Recent Commits
```
7429522 feat: add code-aware tools and context enrichment
f18a7b6 feat(rag): add code-aware tables for symbols, modules, and relationships
e089ae6 feat(rag): replace Vectra with SQLite-based vector store
d74cfef feat(combo-test): persist results to database with auto-update
6ed557e feat(combo-test): sort model lists by size and display size
```

### RAG API Endpoints (New)
- `POST /api/rag/symbols/search` - Search symbols
- `POST /api/rag/symbols/callers` - Get call graph
- `POST /api/rag/files/interface` - Get file interface
- `POST /api/rag/files/dependencies` - Get file dependencies
- `GET /api/rag/code/stats` - Get code statistics

### RAG Query Response (Enhanced)
```json
{
  "results": [...],
  "codeContext": {
    "relatedSymbols": [...],
    "dependentFiles": [...],
    "contextString": "## Related Functions\n..."
  }
}
```

## Is RAG Optimal for Any Model?

### ✅ What's Good
- **SQLite storage** - Reliable, no JSON corruption
- **Code-aware** - Symbols, relationships, dependencies tracked
- **Automatic enrichment** - Related context auto-added
- **Multi-strategy** - code, summary, graph, hybrid
- **HyDE support** - Hypothetical code generation
- **Query expansion** - Multiple related queries

### ⚠️ Improvements Possible
1. **Call relationship tracking** - Currently symbols stored but call relationships not fully extracted during indexing
2. **Cross-file analysis** - Need deeper AST parsing for actual call detection
3. **Vector search optimization** - Current brute-force cosine similarity, could use approximate nearest neighbors (HNSW)

### What Works Now
| Feature | Status |
|---------|--------|
| Semantic code search | ✅ Works |
| Symbol extraction | ✅ Works |
| File dependencies | ✅ Works |
| Automatic context | ✅ Works |
| MCP tools | ✅ Works |
| Call graph | ⚠️ Partial (needs AST parsing) |

## Services
| Service | Port | Purpose |
|---------|------|---------|
| Summy API | 3001 | Main Express server |
| RAG Server | 3002 | Semantic code search |
| RAG WebSocket | 3003 | Real-time progress |
| Continue MCP | 3006 | Extra tools (SSE) |

## Next Actions
1. Run combo tests at `/tooly/combo-test`
2. Test new code-aware tools: `find_symbol`, `get_callers`
3. Consider adding AST-based call relationship extraction
4. Test with different models

# WORKING_MEMORY

## Current Goal
LanceDB Vector Store Migration - COMPLETED ✅

## Session Summary (Dec 26, 2024)

### LanceDB Migration ✅ (MAJOR)
**Replaced SQLite brute-force vector search with LanceDB ANN search**

| Aspect | Before (SQLite) | After (LanceDB) |
|--------|-----------------|-----------------|
| Search complexity | O(n) brute-force | O(log n) ANN |
| 10K vectors | ~100ms | ~1ms |
| Storage | 3KB/vector (BLOB) | ~1KB/vector (columnar) |
| File | `vectors.db` | `lance/` directory |

Changes:
- Created `rag-server/src/storage/lancedb-store.ts`
- Uses `@lancedb/lancedb` package (v0.23.0)
- Uses `makeArrowTable` with `vectorColumns` option for proper schema
- Vector column auto-detected as `vector` field (number[])
- Replaced all `getSQLiteVectorStore` calls with `getLanceDBStore`
- Data stored in `rag-server/data/indices/lance/`
- Reduced chunk size to 1200 tokens (fits nomic-embed 2048 context)

Key learnings:
- LanceDB needs `number[]` not `Float32Array` for proper vector detection
- Use empty strings instead of null for string fields
- `vectorSearch()` method for explicit vector queries

### Recent Commits
```
90857f5 feat(rag): replace SQLite vector store with LanceDB for O(log n) ANN search
7429522 feat: add code-aware tools and context enrichment
f18a7b6 feat(rag): add code-aware tables for symbols, modules, and relationships
e089ae6 feat(rag): replace Vectra with SQLite-based vector store
```

## RAG Architecture

```
SQLite (rag.db)              LanceDB (lance/)
┌─────────────────┐          ┌─────────────────┐
│ • Chunks (text) │          │ • 768D vectors  │
│ • Symbols       │  chunk_  │ • ANN index     │
│ • Relationships │◄───id───►│ • O(log n)      │
│ • Summaries     │          │                 │
│ • File deps     │          │                 │
└─────────────────┘          └─────────────────┘
```

### What's Good ✅
- **LanceDB** - Fast O(log n) vector search
- **SQLite** - Reliable metadata storage
- **Code-aware** - Symbols, relationships, dependencies tracked
- **Automatic enrichment** - Related context auto-added
- **Multi-strategy** - code, summary, graph, hybrid
- **HyDE support** - Hypothetical code generation
- **Query expansion** - Multiple related queries

### Still Needed ⚠️
1. **AST-based call relationship extraction** - Parse function bodies for `calls` relationships
2. **Cross-file analysis** - Track what functions call other functions

## Services
| Service | Port | Purpose |
|---------|------|---------|
| Summy API | 3001 | Main Express server |
| RAG Server | 3002 | Semantic code search |
| RAG WebSocket | 3003 | Real-time progress |
| Continue MCP | 3006 | Extra tools (SSE) |

## Next Actions
1. Implement AST-based call relationship extraction
2. Test RAG performance with LanceDB on larger codebases
3. Run combo tests at `/tooly/combo-test`

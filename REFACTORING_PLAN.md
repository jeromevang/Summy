# Codebase Refactoring Plan: Small Files + Code Index System

## Overview
Transform the Summy codebase from large monolithic files to small, focused files while implementing a comprehensive code index system for LLM navigation. This addresses the core issue of LLM context size limits and improves development efficiency.

## Project Structure Best Practices (Applied)
Based on industry standards (React, TypeScript, Node.js best practices):

### File Naming
- **Components**: PascalCase (`Button.tsx`, `UserProfile.tsx`)
- **Hooks**: camelCase with `use` prefix (`useUser.ts`, `useAuth.ts`)
- **Utilities**: camelCase (`formatDate.ts`, `validateEmail.ts`)
- **Types**: PascalCase with `Types` suffix (`UserTypes.ts`) or `types.ts`
- **Services**: camelCase (`apiClient.ts`, `database.ts`)
- **Routes**: camelCase (`userRoutes.ts`, `apiRoutes.ts`)

### Directory Structure
- **Feature-based**: Group related files by feature/domain
- **Barrel exports**: `index.ts` files for clean imports
- **Separation of concerns**: Components, hooks, utils, types in separate folders
- **Flat structure**: Avoid deep nesting (>3 levels)

## Phase 1: Database Service Setup

### 1.1 Create Database Folder Structure
```
database/
├── package.json
├── src/
│   ├── index.ts                    # Database service entry point
│   ├── services/
│   │   ├── database.ts            # Core database operations
│   │   └── code-index.ts          # Code indexing operations
│   └── analysis/
│       ├── ast-parser.ts          # AST analysis for dependencies
│       ├── index-builder.ts       # Code index building logic
│       └── file-splitter.ts       # Automated file splitting
├── data/                         # Database files
│   ├── summy.db
│   ├── summy.db-shm
│   ├── summy.db-wal
│   └── model-profiles/
└── scripts/
    ├── analyze-codebase.ts       # Build initial index
    ├── update-index.ts          # Incremental updates
    └── split-files.ts           # File splitting utility
```

### 1.2 Database Schema
```sql
-- File metadata
CREATE TABLE code_index (
    file_path TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    exports TEXT,
    inputs TEXT,
    outputs TEXT,
    libraries TEXT,
    category TEXT,
    tags TEXT,
    complexity TEXT,
    lines_count INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Function-level chunks (from AST parsing)
CREATE TABLE code_chunks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL,     -- 'function', 'class', 'component'
    inputs TEXT,                   -- JSON array of parameters
    outputs TEXT,                  -- Return type/description
    start_line INTEGER,
    end_line INTEGER,
    dependencies TEXT,             -- JSON array of called functions
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_path) REFERENCES code_index(file_path)
);

-- Dependency relationships
CREATE TABLE code_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_chunk_id TEXT,
    target_chunk_id TEXT,
    dependency_type TEXT NOT NULL, -- 'calls', 'imports', 'extends'
    metadata TEXT,                 -- Additional context
    FOREIGN KEY (source_chunk_id) REFERENCES code_chunks(id),
    FOREIGN KEY (target_chunk_id) REFERENCES code_chunks(id)
);
```

### 1.3 Database Service Implementation
- [ ] Create database folder structure
- [ ] Move existing database.ts from server/src/services/
- [ ] Create code-index.ts service
- [ ] Set up database schema migrations
- [ ] Create database package.json with dependencies

## Phase 2: File Splitting Strategy (Option B: Related Functions Grouped)

### 2.1 High Priority Splits

#### 2.1.1 Tooly.tsx (1909 lines → 8 focused files)
**Before:** `client/src/pages/Tooly.tsx`
**After:**
```
client/src/pages/Tooly/
├── index.ts                      # Main exports (barrel export)
├── Tooly.tsx                     # Core page component (~150 lines)
├── components/
│   ├── ModelSelector.tsx         # Model selection UI (~120 lines)
│   ├── TestRunner.tsx            # Test execution UI (~100 lines)
│   ├── StatusDisplay.tsx         # Status indicators (~80 lines)
│   ├── LogViewer.tsx             # Log display component (~90 lines)
│   ├── LatencyProfiler.tsx       # Latency profiling UI (~70 lines)
│   └── CapabilityMatrix.tsx      # Tool capability display (~80 lines)
├── hooks/
│   ├── useModels.ts              # Model state management (~60 lines)
│   ├── useTests.ts               # Test execution state (~50 lines)
│   ├── useWebSocket.ts           # WebSocket connection (~40 lines)
│   ├── useLatencyProfile.ts      # Latency profiling logic (~45 lines)
│   └── useToolCapabilities.ts    # Capability management (~35 lines)
├── utils/
│   ├── formatters.ts             # Data formatting utilities (~30 lines)
│   ├── validators.ts             # Input validation (~25 lines)
│   └── testDefinitions.ts        # Test case definitions (~40 lines)
└── types.ts                      # Local type definitions (~15 lines)
```

**Migration Steps:**
- [ ] Create Tooly/ directory structure
- [ ] Extract ModelSelector component and logic
- [ ] Extract TestRunner component and logic
- [ ] Extract StatusDisplay component
- [ ] Extract LogViewer component
- [ ] Extract LatencyProfiler component
- [ ] Extract CapabilityMatrix component
- [ ] Extract useModels hook
- [ ] Extract useTests hook
- [ ] Extract useWebSocket hook
- [ ] Extract useLatencyProfile hook
- [ ] Extract useToolCapabilities hook
- [ ] Extract utility functions
- [ ] Create barrel exports in index.ts
- [ ] Update all imports throughout codebase
- [ ] Run tests to verify no breaking changes

#### 2.1.2 server/src/index.ts (2826 lines → Route Modules)
**Before:** `server/src/index.ts`
**After:**
```
server/src/
├── index.ts                      # Main server entry (~50 lines)
├── app.ts                        # Express app setup (~100 lines)
├── routes/
│   ├── index.ts                  # Route exports (barrel)
│   ├── tooly.ts                  # Tooly routes (~200 lines)
│   ├── analytics.ts              # Analytics routes (~100 lines)
│   ├── notifications.ts          # Notification routes (~80 lines)
│   ├── rag.ts                    # RAG routes (~60 lines)
│   └── api.ts                    # General API routes (~40 lines)
├── middleware/
│   ├── index.ts
│   ├── cors.ts                   # CORS configuration
│   ├── logging.ts                # Request logging
│   ├── errorHandler.ts           # Error handling
│   └── rateLimit.ts              # Rate limiting
├── services/
│   ├── index.ts
│   ├── database.ts               # Database service
│   ├── ws-broadcast.ts           # WebSocket broadcasting
│   ├── system-metrics.ts         # System metrics
│   ├── notifications.ts          # Notification service
│   └── rag-client.ts             # RAG client
└── utils/
    ├── index.ts
    ├── config.ts                 # Configuration loading
    ├── logger.ts                 # Logging utilities
    └── validation.ts             # Input validation
```

**Migration Steps:**
- [ ] Create routes/ directory and split route handlers
- [ ] Create middleware/ directory for middleware functions
- [ ] Create services/ directory for service functions
- [ ] Create utils/ directory for utility functions
- [ ] Update main index.ts to use modular structure
- [ ] Create barrel exports for each module
- [ ] Update import statements
- [ ] Run tests to verify server functionality

#### 2.1.3 test-engine.ts (1577+ lines → Focused Modules)
**Before:** `server/src/modules/tooly/test-engine.ts`
**After:**
```
server/src/modules/tooly/test-engine/
├── index.ts                      # Main exports
├── core/
│   ├── TestRunner.ts             # Core test execution (~200 lines)
│   ├── TestCoordinator.ts        # Test coordination (~150 lines)
│   └── ResultProcessor.ts        # Result processing (~120 lines)
├── providers/
│   ├── LMStudioProvider.ts       # LM Studio integration (~100 lines)
│   ├── OpenAIProvider.ts         # OpenAI integration (~80 lines)
│   ├── AzureProvider.ts          # Azure integration (~70 lines)
│   └── ProviderInterface.ts      # Provider interface (~30 lines)
├── tests/
│   ├── CapabilityTests.ts        # Tool capability tests (~300 lines)
│   ├── ProbeTests.ts             # Behavioral probe tests (~250 lines)
│   ├── LatencyTests.ts           # Latency profiling (~150 lines)
│   └── TestDefinitions.ts        # Test case definitions (~200 lines)
├── utils/
│   ├── ModelManager.ts           # Model loading/unloading (~100 lines)
│   ├── ResultAggregator.ts       # Result aggregation (~80 lines)
│   └── ErrorHandler.ts           # Test error handling (~60 lines)
└── types.ts                      # Test-related types (~40 lines)
```

### 2.2 Medium Priority Splits
- [ ] Large component files (>300 lines)
- [ ] Large utility files (>200 lines)
- [ ] Large service files (>250 lines)

### 2.3 Import Strategy: Barrel Exports
All modules will use barrel exports for clean imports:

```typescript
// client/src/pages/Tooly/index.ts
export { default as Tooly } from './Tooly';
export { ModelSelector } from './components/ModelSelector';
export { useModels } from './hooks/useModels';
export type { ToolyProps } from './types';

// Usage remains clean:
import { Tooly, ModelSelector, useModels } from '../pages/Tooly';
```

### 2.4 Type Definition Strategy
- **Component types**: Keep with components in `types.ts`
- **Shared types**: Centralize in `src/types/` directory
- **API types**: Keep with API routes/services
- **Utility types**: Keep with utilities

## Phase 3: Enhanced MCP Tools

### 3.1 New Navigation Tools
```typescript
// Component discovery
server.registerTool("find_components", {
  description: "Find UI components by functionality",
  parameters: { functionality: "string", category: "string" }
});

// Function-level tracing
server.registerTool("trace_function", {
  description: "Trace function calls and dependencies at function level",
  parameters: { functionName: "string", filePath: "string", depth: "number" }
});

// Code reading with context
server.registerTool("read_component", {
  description: "Read a complete component with all its dependencies",
  parameters: { componentName: "string", includeDeps: "boolean" }
});

// Data flow tracing
server.registerTool("trace_data_flow", {
  description: "Trace input/output flow through the dependency chain",
  parameters: {
    startFile: "string",
    direction: "string", // "forward", "backward", "both"
    maxDepth: "number"
  }
});
```

### 3.2 Updated MCP Rules
```typescript
const mcpRules = {
  workflow: [
    "1. Use find_components to locate relevant UI elements",
    "2. Use trace_function to understand data flow at function level",
    "3. Use read_component to get complete implementation (fits in context)",
    "4. Use trace_data_flow to understand input/output chains",
    "5. Use rag_query for semantic code search",
    "6. Edit small, focused files safely"
  ]
};
```

## Phase 4: Code Index System

### 4.1 AST Analysis Enhancement
- [ ] Enhance RAG chunker to extract function signatures
- [ ] Add input/output parameter analysis
- [ ] Build function-level dependency graphs
- [ ] Create chunk metadata with usage patterns

### 4.2 Metadata Generation
- [ ] Automatic scope description generation
- [ ] Input/output contract extraction
- [ ] Library usage detection
- [ ] Complexity analysis

### 4.3 Index Maintenance
- [ ] Real-time index updates on file changes
- [ ] Incremental analysis for performance
- [ ] Cross-reference validation

## Phase 5: Testing & Validation

### 5.1 Testing Strategy
- [ ] Run full test suite after each file split
- [ ] Import/export validation
- [ ] Component integration testing
- [ ] API endpoint testing
- [ ] End-to-end workflow testing

### 5.2 Performance Validation
- [ ] LLM context size reduction measurement
- [ ] File discovery speed testing
- [ ] Function tracing accuracy validation

## Phase 6: Documentation & Training

### 6.1 Update Documentation
- [ ] Update README.md with new structure
- [ ] Create architecture documentation
- [ ] Update development setup guides

### 6.2 LLM Training
- [ ] Update system prompts for new tools
- [ ] Create examples of new workflows
- [ ] Document best practices for small file development

## Success Metrics

- ✅ Average file size < 200 lines (target: < 150 lines)
- ✅ LLM context usage reduced by 80%
- ✅ File discovery < 3 seconds via metadata
- ✅ Function tracing works across file boundaries
- ✅ No breaking changes to functionality
- ✅ Improved development velocity
- ✅ All tests passing

## Implementation Timeline

### Week 1: Infrastructure (Database + MCP Tools)
- [ ] Database service setup
- [ ] MCP tool enhancements
- [ ] Basic code index system

### Week 2: Core Splits (Tooly + Server)
- [ ] Split Tooly.tsx into feature modules
- [ ] Split server/src/index.ts into route modules
- [ ] Update imports and test

### Week 3: Test Engine Refactoring
- [ ] Split test-engine.ts into focused modules
- [ ] Update module imports
- [ ] Comprehensive testing

### Week 4: Remaining Files + Polish
- [ ] Split remaining large files
- [ ] Performance optimization
- [ ] Documentation updates

## Risk Mitigation

- **Testing:** Run tests after each split to catch issues early
- **Backup:** Git commits after each major phase
- **Gradual:** Split one major file at a time
- **Validation:** Import/export checking and component integration tests

## Rollback Plan

If issues arise:
1. Keep original files as backup during transition
2. Rollback imports to point to original files
3. Gradually migrate imports back to new structure
4. Use git to revert changes if needed

---

*This plan transforms the Summy codebase into an LLM-native architecture with efficient context usage and surgical navigation capabilities.*

# Comprehensive Test Plan for Summy

## Overview
This document outlines the complete testing strategy for all Summy features and subsystems.

## Test Categories

### 1. RAG Server Tests (Port 3002)
**Location**: `rag-server/src/__tests__/`

#### 1.1 Indexing Tests
- [ ] Initial project indexing completes successfully
- [ ] Index creates vector embeddings for all supported file types (.js, .ts, .py, .tsx, .jsx)
- [ ] Index stores metadata (file path, line numbers, symbols)
- [ ] Large codebases (1000+ files) index without crashing
- [ ] Re-indexing updates existing entries correctly

#### 1.2 File Watcher Tests
- [ ] Chokidar detects new file creation
- [ ] File modifications trigger re-indexing of changed file only
- [ ] File deletion removes entries from index
- [ ] Directory changes are detected
- [ ] .gitignore patterns are respected
- [ ] Multiple rapid changes don't cause race conditions

#### 1.3 Semantic Search Tests
- [ ] Natural language queries return relevant results
- [ ] Code snippet search works (e.g., "function that handles authentication")
- [ ] Symbol search returns correct definitions
- [ ] Relevance scoring ranks results appropriately
- [ ] Search filters work (file types, paths)
- [ ] Empty queries are handled gracefully

#### 1.4 Tree-sitter Parsing Tests
- [ ] JavaScript/TypeScript code is parsed correctly
- [ ] Python code is parsed correctly
- [ ] Symbols (functions, classes, methods) are extracted
- [ ] Nested structures are handled
- [ ] Syntax errors don't crash parser

### 2. MCP Server Tests (stdio)
**Location**: `mcp-server/src/__tests__/`

#### 2.1 File Tools
- [ ] `read_file` - Reads files correctly
- [ ] `write_file` - Creates/overwrites files
- [ ] `edit_file` - Makes selective edits
- [ ] `delete_file` - Deletes files
- [ ] `copy_file` - Copies files
- [ ] `move_file` - Moves/renames files
- [ ] `list_directory` - Lists with .gitignore respect
- [ ] `search_files` - grep functionality works
- [ ] `get_file_info` - Returns metadata

#### 2.2 Git Tools
- [ ] `git_status` - Shows repo status
- [ ] `git_diff` - Shows changes
- [ ] `git_log` - Shows commit history
- [ ] `git_add` - Stages files
- [ ] `git_commit` - Creates commits
- [ ] `git_branch_create` - Creates branches
- [ ] `git_branch_list` - Lists branches
- [ ] `git_checkout` - Switches branches
- [ ] `git_blame` - Shows file history

#### 2.3 NPM Tools
- [ ] `npm_install` - Installs packages
- [ ] `npm_uninstall` - Removes packages
- [ ] `npm_run` - Executes scripts
- [ ] `npm_test` - Runs tests
- [ ] `npm_build` - Builds project

#### 2.4 Browser Tools (Playwright)
- [ ] `browser_navigate` - Loads pages
- [ ] `browser_click` - Clicks elements
- [ ] `browser_type` - Types text
- [ ] `browser_snapshot` - Gets accessibility tree
- [ ] `browser_screenshot` - Captures screenshots
- [ ] `browser_evaluate` - Runs JavaScript
- [ ] Popup dismissal works

#### 2.5 RAG Tools
- [ ] `rag_query` - Semantic search works
- [ ] `rag_status` - Returns index status
- [ ] `rag_index` - Triggers indexing
- [ ] `find_symbol` - Finds definitions
- [ ] `get_callers` - Finds function callers
- [ ] `trace_function` - Traces dependencies

#### 2.6 Refactor Tools
- [ ] `refactor_split_file` - Splits large files
- [ ] Creates focused modules
- [ ] Generates barrel files
- [ ] Preserves imports/exports

#### 2.7 System Tools
- [ ] `shell_exec` - Executes commands
- [ ] `process_list` - Lists processes
- [ ] `process_kill` - Kills processes
- [ ] Environment variable management

### 3. Workspace Management Tests
**Location**: `server/src/services/__tests__/workspace-service.test.ts`

#### 3.1 Project Switching
- [ ] Switching project updates active path
- [ ] RAG server restarts indexing for new project
- [ ] MCP server restarts with new cwd
- [ ] Previous project state is saved
- [ ] Safe mode prevents edits on dirty repos

#### 3.2 Git Integration
- [ ] Detects git repository status
- [ ] Safe mode activates when repo is dirty
- [ ] Uncommitted changes are flagged
- [ ] Branch information is tracked

### 4. Team Builder Tests
**Location**: `client/src/pages/__tests__/TeamBuilder.test.tsx`

#### 4.1 Squad Creation
- [ ] Main Architect selection works
- [ ] Executor model selection works
- [ ] Specialist agents can be added
- [ ] Squad configuration is validated

#### 4.2 Persistence
- [ ] Team configs save to `data/teams.json`
- [ ] Configs are project-scoped
- [ ] Loading saved teams works
- [ ] Editing teams updates correctly
- [ ] Deleting teams removes from storage

### 5. Learning System Tests (Tooly)
**Location**: `server/src/modules/tooly/__tests__/`

#### 5.1 Model Testing
- [ ] Baseline tests execute
- [ ] Custom tests can be created
- [ ] Test results are stored
- [ ] Latency profiling works
- [ ] Token counting is accurate

#### 5.2 Combo Teaching
- [ ] Main + Executor pairs are tested
- [ ] Failure patterns are detected
- [ ] Prosthetic prompts are generated
- [ ] Teaching iterations improve scores
- [ ] Results are persisted per project

#### 5.3 Prosthetic Manager
- [ ] Prosthetics are stored per project hash
- [ ] Can be applied to models
- [ ] Testing prosthetics before applying works
- [ ] Rollback functionality works

#### 5.4 Failure Analysis
- [ ] Failures are logged with context
- [ ] Pattern detection identifies common issues
- [ ] Failure resolution tracking works
- [ ] Analytics show improvement over time

### 6. API Bridge Tests
**Location**: `server/src/routes/__tests__/api-bridge.test.ts`

#### 6.1 External Integration
- [ ] `/api/bridge/info` returns configuration
- [ ] System prompt snippet is generated
- [ ] External agents can query RAG
- [ ] Authentication works (if enabled)
- [ ] Rate limiting works

#### 6.2 RAG Endpoints
- [ ] `POST /api/rag/query` returns semantic results
- [ ] `GET /api/nav/symbols` lists symbols
- [ ] Results include file paths and line numbers
- [ ] CORS headers allow external access

### 7. Sources Page Tests
**Location**: `client/src/pages/__tests__/Sources.test.tsx`

#### 7.1 API Key Management
- [ ] OpenAI key can be added/edited
- [ ] Anthropic key can be added/edited
- [ ] LMStudio endpoint can be configured
- [ ] Ollama endpoint can be configured
- [ ] Google (Gemini) key can be added
- [ ] Keys are persisted to settings
- [ ] Keys are masked in UI

#### 7.2 Provider Management
- [ ] Multiple providers can coexist
- [ ] Provider enable/disable works
- [ ] Default provider can be set
- [ ] Connection testing works

### 8. Real-time Updates Tests
**Location**: `server/src/services/__tests__/ws-broadcast.test.ts`

#### 8.1 WebSocket Communication
- [ ] WebSocket connection establishes
- [ ] Reconnection works after disconnect
- [ ] Broadcast to all clients works
- [ ] Targeted messages work

#### 8.2 Debug Page Updates
- [ ] Live request logs appear
- [ ] Session updates appear in real-time
- [ ] System metrics update
- [ ] Error events are broadcast

### 9. Database Tests
**Location**: `database/__tests__/`

#### 9.1 Sessions
- [ ] Sessions are created automatically
- [ ] Conversation turns are stored
- [ ] Sessions can be retrieved
- [ ] Sessions can be deleted
- [ ] Search works

#### 9.2 Context Storage
- [ ] Context is persisted
- [ ] Large contexts don't exceed limits
- [ ] Context can be edited
- [ ] Context versioning works (if implemented)

#### 9.3 Settings
- [ ] Settings load from file
- [ ] Settings save to file
- [ ] Defaults are applied correctly
- [ ] Validation prevents invalid settings

### 10. Memory System Tests
**Location**: `server/src/services/__tests__/memory-service.test.ts`

#### 10.1 Project-Scoped Storage
- [ ] Prosthetics stored per project hash
- [ ] Failure logs stored per project
- [ ] Switching projects loads correct data
- [ ] Data doesn't leak between projects

#### 10.2 Global Memory
- [ ] Global preferences persist
- [ ] User-level settings work
- [ ] Cross-project data is accessible

### 11. Integration Tests
**Location**: `tests/integration/`

#### 11.1 End-to-End Workflows
- [ ] Complete project switch workflow
- [ ] Complete combo teaching workflow
- [ ] Complete prosthetic generation workflow
- [ ] External agent integration workflow
- [ ] IDE proxy workflow

#### 11.2 Performance Tests
- [ ] Large codebase indexing performance
- [ ] Search query response time
- [ ] WebSocket message throughput
- [ ] Database query performance

## Test Implementation Strategy

### Phase 1: Unit Tests (Week 1)
- Set up Vitest for all workspaces
- Write unit tests for pure functions
- Mock external dependencies
- Aim for 80% code coverage

### Phase 2: Integration Tests (Week 2)
- Test subsystem interactions
- Test API endpoints
- Test database operations
- Test service communication

### Phase 3: E2E Tests (Week 3)
- Playwright tests for UI workflows
- Complete user journeys
- Real browser automation
- Screenshot regression testing

### Phase 4: Performance & Load Tests (Week 4)
- Stress test RAG indexing
- Load test WebSocket connections
- Memory leak detection
- Optimization based on results

## Test Data

### Test Projects
- **Small**: 10 files, simple structure
- **Medium**: 100 files, typical React app
- **Large**: 1000+ files, monorepo structure

### Test Fixtures
- Sample code files (JS/TS/Python)
- Mock API responses
- Test databases (SQLite)
- Sample configurations

## CI/CD Integration

### GitHub Actions Workflow
```yaml
- Run unit tests on every push
- Run integration tests on PR
- Run E2E tests before merge
- Generate coverage reports
- Fail build on test failures
```

## Success Criteria

- ✅ All tests pass
- ✅ 80%+ code coverage
- ✅ No memory leaks
- ✅ Performance benchmarks met
- ✅ Zero critical bugs in production features

## Test Execution

```bash
# Run all tests
npm test

# Run specific suite
npm run test:rag
npm run test:mcp
npm run test:e2e

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

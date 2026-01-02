# Summy Test Suite

Comprehensive testing for all Summy subsystems and features.

## Overview

This test suite provides extensive coverage of:
- **RAG Server** - Indexing, file watching, semantic search
- **MCP Server** - All tool categories (file, git, npm, browser, etc.)
- **Workspace Management** - Project switching, git integration
- **Team Builder** - Squad creation and persistence
- **Learning System** - Combo teaching, prosthetics, failure analysis
- **WebSocket** - Real-time updates and broadcasting
- **Database** - Persistence and data integrity

## Prerequisites

Before running tests, ensure all services are running:

```bash
# Start all services
npm run dev
```

This starts:
- Main Server (port 3001)
- RAG Server (port 3002)
- Client (port 5173)
- MCP Server (stdio)

## Running Tests

### Run All Tests

```bash
# Run comprehensive test suite (unit + functional + E2E)
npm run test:all

# Run functional tests only
npm run test:functional

# Run unit tests only
npm test

# Run E2E UI tests only
npm run test:e2e
```

### Run Individual Test Suites

```bash
# RAG Server tests
npm run test:rag

# MCP Server tests
npm run test:mcp

# Workspace Management tests
npm run test:workspace

# Team Builder tests
npm run test:team

# Learning System tests
npm run test:learning

# WebSocket tests
npm run test:ws
```

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage
```

## Test Structure

```
tests/
├── functional/              # Functional tests for each subsystem
│   ├── rag-server.test.mjs
│   ├── mcp-server.test.mjs
│   ├── workspace-management.test.mjs
│   ├── team-builder.test.mjs
│   ├── learning-system.test.mjs
│   └── websocket.test.mjs
├── integration/             # Integration tests (cross-system)
├── fixtures/                # Test data and fixtures
├── vitest.config.mjs        # Test configuration
├── run-all-tests.mjs        # Test runner script
└── README.md                # This file

server/src/__tests__/        # Server unit tests
client/src/__tests__/        # Client unit tests
mcp-server/src/__tests__/    # MCP unit tests
rag-server/src/__tests__/    # RAG unit tests
```

## Test Categories

### 1. RAG Server Tests (rag-server.test.mjs)

Tests semantic code search and indexing:
- ✅ Initial project indexing
- ✅ File watcher detection (create, modify, delete)
- ✅ Semantic search with natural language
- ✅ Symbol extraction and navigation
- ✅ Relevance scoring

**Timeout**: 120 seconds

### 2. MCP Server Tests (mcp-server.test.mjs)

Tests all MCP tool categories:
- ✅ File tools (read, write, edit, delete, copy, move)
- ✅ Git tools (status, add, commit, branch, log)
- ✅ NPM tools (install, run scripts, list packages)
- ✅ System tools (shell exec, process management)
- ✅ Environment variables

**Timeout**: 180 seconds

### 3. Workspace Management Tests (workspace-management.test.mjs)

Tests project switching and isolation:
- ✅ Switch between projects
- ✅ RAG reindexing on switch
- ✅ MCP server restart with new cwd
- ✅ Git integration and safe mode
- ✅ Project-scoped data isolation

**Timeout**: 120 seconds

### 4. Team Builder Tests (team-builder.test.mjs)

Tests squad creation and management:
- ✅ Create/update/delete teams
- ✅ Main Architect + Executor + Specialists
- ✅ Team activation and switching
- ✅ Persistence to data/teams.json
- ✅ Project-scoped storage

**Timeout**: 60 seconds

### 5. Learning System Tests (learning-system.test.mjs)

Tests Tooly learning features:
- ✅ Model testing and profiling
- ✅ Custom test creation and execution
- ✅ Combo teaching iterations
- ✅ Prosthetic generation and application
- ✅ Failure logging and pattern detection

**Timeout**: 240 seconds (4 minutes for AI model calls)

### 6. WebSocket Tests (websocket.test.mjs)

Tests real-time communication:
- ✅ Connection establishment and reconnection
- ✅ Session creation/update broadcasts
- ✅ System metrics updates
- ✅ Multiple client support
- ✅ Message ordering

**Timeout**: 60 seconds

## Test Data

Test fixtures are created in `tests/fixtures/` during test execution:
- **test-project** - Small project with sample files
- **project-a** - First test project for switching
- **project-b** - Second test project for switching
- **mcp-test** - MCP tool execution environment

All fixtures are cleaned up after tests complete.

## Troubleshooting

### Tests Timeout

If tests timeout frequently:
1. Check that all services are running (`npm run dev`)
2. Increase timeout in `vitest.config.mjs`
3. Check system resources (CPU, memory)
4. Run tests individually to isolate issues

### Connection Refused

```
Error: connect ECONNREFUSED localhost:3001
```

**Solution**: Start services with `npm run dev` first.

### File Watch Errors

```
Error: ENOSPC: System limit for number of file watchers reached
```

**Solution** (Linux):
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Git Not Found (MCP Tests)

Ensure git is installed and in PATH:
```bash
git --version
```

### WebSocket Connection Issues

Check firewall settings and ensure port 3001 is accessible.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm run install:all

      - name: Start services
        run: npm run dev &

      - name: Wait for services
        run: sleep 10

      - name: Run tests
        run: npm run test:all

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Performance Benchmarks

Expected test execution times (on standard hardware):

| Test Suite | Duration | API Calls |
|-----------|----------|-----------|
| RAG Server | ~30s | 15+ |
| MCP Server | ~45s | 25+ |
| Workspace | ~40s | 20+ |
| Team Builder | ~20s | 15+ |
| Learning System | ~120s | 10+ (AI models) |
| WebSocket | ~25s | 10+ |
| **Total** | **~280s** | **95+** |

## Writing New Tests

### Template

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';

describe('My Feature Tests', () => {
  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should do something', async () => {
    const response = await fetch('http://localhost:3001/api/endpoint');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('field');
  });
});
```

### Best Practices

1. **Isolation** - Tests should not depend on each other
2. **Cleanup** - Always clean up test data in `afterAll`
3. **Timeouts** - Set appropriate timeouts for slow operations
4. **Error Handling** - Check for both success and failure cases
5. **Real Data** - Use realistic test data and scenarios

## Success Criteria

✅ All test suites pass
✅ 80%+ code coverage
✅ No memory leaks
✅ Performance within benchmarks
✅ Zero flaky tests

## Support

For issues or questions:
- Check `COMPREHENSIVE_TEST_PLAN.md` for detailed specifications
- Review individual test files for examples
- Check server logs in `dev.out` and `dev.err`

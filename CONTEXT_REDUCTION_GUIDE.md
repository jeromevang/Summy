# MCP Toolset Presets - Context Reduction Guide

## 📊 Expected Token Savings

### Baseline (Before Implementation)
- **All Tools Loaded**: ~54,000 tokens (27.1% of 200k context)
- **Tool Categories**: 8 (file_ops, git, npm, browser, rag, refactor, memory, system)
- **Total Tools**: 50+ individual tools

### After Implementation

| Preset | Categories Loaded | Est. Tokens | Savings | Use Case |
|--------|------------------|-------------|---------|----------|
| **Minimal** | 2 (rag, memory) | ~8,000 | **85%** ↓ | Cloud APIs (GPT-4, Claude) |
| **Standard** | 5 (rag, memory, browser, refactor, system) | ~15,000 | **71%** ↓ | Recommended for most users |
| **Full** | 8 (all categories) | ~54,000 | 0% | Local models needing all tools |
| **Custom** | User choice | Varies | Varies | Advanced users |

## 🧪 How to Verify Context Reduction

### Method 1: Via Claude Code `/context` Command

1. **Configure Minimal Preset:**
   ```bash
   # Via UI: Settings → MCP Tools → Select "Minimal"
   # Or via API:
   curl -X POST http://localhost:3001/api/settings \
     -H "Content-Type: application/json" \
     -d '{"mcp":{"toolset":"minimal","customCategories":[]}}'
   ```

2. **Restart MCP Server:**
   ```bash
   curl -X POST http://localhost:3001/api/mcp/restart
   ```

3. **Check Context in Claude Code:**
   ```
   /context
   ```

4. **Look for MCP tools line:**
   ```
   ⛁ MCP tools: ~8k tokens (4%)     ← Should be drastically reduced!
   ```

### Method 2: Count Registered Tools

1. **Check MCP Server Logs:**
   ```bash
   # Look for startup logs
   [MCP] Loading "minimal" toolset preset
   [MCP] Description: For cloud APIs with built-in tools - RAG + Memory only
   [MCP] Estimated tokens: 8000
   [MCP] Tool categories: rag, memory
   [MCP] ✓ Registering RAG search tools
   [MCP] ✓ Registering memory tools
   [MCP] Registered toolset with 2 optional categories
   ```

2. **Verify Only Expected Tools Present:**
   - Minimal: Should only have RAG (5 tools) + Memory (4 tools) + Core utilities
   - Standard: RAG + Memory + Browser + Refactor + System tools
   - Full: All 50+ tools

### Method 3: Automated Verification Script

Run the included verification script:

```bash
npm run verify:context
# or directly:
node verify-context-reduction.mjs
```

## 📈 Real-World Impact

### Minimal Preset (8k tokens)
- **Best for**: Claude API, GPT-4, Gemini Pro
- **Why**: These models have comprehensive built-in tool support
- **Benefit**: Maximum context available for your actual code
- **Context freed**: 46k tokens = **23% more room for code!**

### Standard Preset (15k tokens) - RECOMMENDED
- **Best for**: Balanced usage, most development scenarios
- **Why**: Keeps essential specialized tools (RAG, Browser, Refactor)
- **Benefit**: Good balance of functionality and context efficiency
- **Context freed**: 39k tokens = **19.5% more room for code!**

### Full Preset (54k tokens)
- **Best for**: Local models (LM Studio, Ollama), power users
- **Why**: Local models need comprehensive tooling
- **Benefit**: Maximum functionality
- **Context freed**: 0 tokens (all tools available)

## 🎯 Recommended Presets by Scenario

| Scenario | Preset | Why |
|----------|---------|-----|
| Using Claude API via IDE | Minimal | Claude has excellent built-in tools |
| Using GPT-4 via IDE | Minimal | GPT-4 has comprehensive tool support |
| Using Local Models | Full | Local models need all tools |
| General Development | Standard | Best balance for most users |
| Working with Large Codebases | Minimal | Maximize context for code |
| Browser Automation Tasks | Custom: rag, browser, memory | Only load what you need |
| Code Refactoring Projects | Custom: rag, refactor, memory | Focused toolset |

## 🔧 Configuration Examples

### Example 1: Minimal for Claude API
```json
{
  "mcp": {
    "toolset": "minimal",
    "customCategories": []
  }
}
```

### Example 2: Custom for Web Scraping
```json
{
  "mcp": {
    "toolset": "custom",
    "customCategories": ["rag", "browser", "memory", "system"]
  }
}
```

### Example 3: Full for Local LLM
```json
{
  "mcp": {
    "toolset": "full",
    "customCategories": []
  }
}
```

## 📝 Per-Tool Token Estimates

| Tool Category | Tools Count | Est. Tokens | Description |
|--------------|-------------|-------------|-------------|
| file_ops | 20+ | 12,000 | Read, write, edit, delete files |
| git | 17+ | 10,000 | Version control operations |
| npm | 7+ | 4,000 | Package management |
| browser | 15+ | 8,000 | Playwright automation |
| rag | 5+ | 5,000 | Semantic code search |
| refactor | 2+ | 2,000 | Code refactoring |
| memory | 4+ | 3,000 | Persistent storage |
| system | 6+ | 4,000 | Shell execution, processes |
| **TOTAL** | **76+** | **48,000** | (Plus ~6k core utilities) |

## 🚀 Quick Start

1. **Open Settings:** Navigate to `http://localhost:5173/settings`
2. **Scroll to MCP Tools Configuration**
3. **Select a Preset:** Choose "Standard" (recommended)
4. **Click "Restart MCP Server"**
5. **Verify:** Run `/context` in Claude Code to see the reduction!

## 🎓 Understanding Context Usage

### Before Optimization:
```
⛁ ⛀ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   200k/200k tokens (100%)
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   ⛁ System: 3.2k (1.6%)
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   ⛁ System tools: 14.8k (7.4%)
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   ⛁ MCP tools: 54.2k (27.1%) ← HIGH!
⛁ ⛁ ⛁ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Messages: 30.6k (15.3%)
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛝ ⛝ ⛝   ⛶ Free: 49k (24.3%)
```

### After Standard Preset:
```
⛁ ⛀ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   200k/200k tokens (100%)
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   ⛁ System: 3.2k (1.6%)
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   ⛁ System tools: 14.8k (7.4%)
⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁ ⛁   ⛁ MCP tools: 15.0k (7.5%) ← REDUCED!
⛁ ⛁ ⛁ ⛁ ⛁ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Messages: 30.6k (15.3%)
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛶ Free: 88k (44%) ← +39k MORE!
```

**Result:** 39k additional tokens available for your code and context!

## ✅ Verification Checklist

- [ ] Settings page shows MCP Tools Configuration section
- [ ] Can select different presets (minimal, standard, full, custom)
- [ ] Token estimates update when changing presets
- [ ] "Restart MCP Server" button appears after changes
- [ ] Settings persist across page reloads
- [ ] server/settings.json reflects chosen preset
- [ ] MCP server logs show correct tool registration
- [ ] `/context` command shows reduced MCP token usage
- [ ] Only selected tool categories are available

## 🐛 Troubleshooting

### Issue: Context not reduced after changing preset
**Solution:** Make sure to click "Restart MCP Server" button!

### Issue: MCP tools still showing high tokens
**Solution:**
1. Check `server/settings.json` has correct `mcp.toolset`
2. Restart Claude Code completely
3. Run `/context` again

### Issue: Custom categories not saving
**Solution:**
1. Check browser console for errors
2. Verify `/api/settings` endpoint is responding
3. Check `server/settings.json` file permissions

### Issue: Restart button doesn't work
**Solution:**
1. Check if main server is running on port 3001
2. Look at server logs for errors
3. Try manual restart: `npm run dev`

## 📚 Further Reading

- [MCP Protocol Documentation](https://github.com/anthropics/model-context-protocol)
- [Claude Code Best Practices](https://claude.ai/code)
- [Context Window Optimization Strategies](https://anthropic.com/docs)

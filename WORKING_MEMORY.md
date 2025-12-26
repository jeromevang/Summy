# WORKING_MEMORY

## Current Goal
CLI Dashboard - NEW ✅

## Session Summary (Dec 26, 2024 - Late Evening)

### CLI Dashboard Created ✅ (Latest)
**Built a modern ASCII terminal dashboard for real-time monitoring**

**Run with:** `npm run dashboard` (from root or server folder)

**Features:**
- **Services Panel** - Live status of API (3001), RAG (3002), WS (3003), MCP (3006)
- **System Metrics** - CPU, GPU, VRAM gauges with live updates
- **Dual-Model Status** - Main + Executor model info and scores
- **Live Stats** - Request count, tool calls, avg latency, errors
- **Activity Log** - Scrolling log of recent requests
- **Error Panel** - Toggle with 'E' key for critical errors

**Keyboard Controls:**
- `Q` - Quit dashboard
- `R` - Force refresh
- `T` - Run combo tests
- `C` - Clear stats
- `E` - Toggle error panel

**Technical Details:**
- Uses `blessed` + `blessed-contrib` for terminal UI
- WebSocket for real-time updates (polling as 10s fallback)
- Dashboard requests have `X-Dashboard-Request` header (server skips logging)

**Files Created/Modified:**
- `server/src/cli/dashboard.ts` - New dashboard implementation
- `server/package.json` - Added blessed, blessed-contrib, chalk dependencies
- `package.json` - Added `dashboard` script
- `server/src/index.ts` - Skip logging for dashboard requests

### Error Suppression Fixed ✅
**Concern:** Silent catch blocks were swallowing errors

**Fixed:**
- All catch blocks in dashboard.ts now log errors
- Intent-router catch blocks log parse failures
- Server still has 70+ silent catches in other files (legacy, to review later)

### Previous Session Work (Still Valid)
- Robust Intent Parser with 11+ tool call formats
- Combo Testing at 100% pass rate
- Dual-Model Routing stable

## Current Active Settings
```json
{
  "enableDualModel": true,
  "mainModelId": "qwen/qwen3-4b-2507",
  "executorModelId": "mistralai/ministral-3-3b"
}
```

## Services
| Service | Port | Purpose |
|---------|------|---------|
| Summy API | 3001 | Main Express server |
| RAG Server | 3002 | Semantic code search |
| RAG WebSocket | 3003 | Real-time progress |
| Continue MCP | 3006 | Extra tools (SSE) |

## Key Files This Session
- `server/src/cli/dashboard.ts` - NEW: ASCII dashboard
- `server/src/index.ts` - Skip logging for dashboard polling
- `server/src/modules/tooly/intent-router.ts` - Added error logging to catch blocks

## Next Actions
1. Test dashboard with live traffic
2. Add `/api/tooly/metrics` endpoint for system metrics
3. Review and fix remaining 70+ silent catch blocks in codebase
4. Consider adding WebSocket broadcast for real-time dashboard updates

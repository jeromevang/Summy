# WORKING_MEMORY

## Current Goal
Self-Improving Agentic System - **IMPLEMENTATION IN PROGRESS**

## Session Summary (Dec 26, 2024 - Night)

### Implementation Status: 100% Complete ✅

#### Phase 1: Foundation (100% Complete) ✅
- [x] `failure-log.ts` - JSON-based failure persistence at `server/data/failure-log.json`
- [x] `combo-profile-store.ts` - Combo profiles at `server/data/combo-profiles/`
- [x] Extended `capabilities.ts` with:
  - `nativeScore`, `trainedScore`, `trainable` per capability
  - `capabilityMap`, `nativeStrengths`, `learnedCapabilities`, `blockedCapabilities`
  - `smokeTestResults` for quick assessment data
  - Helper methods: `updateCapabilityMap()`, `isCapabilityBlocked()`, `getFallbackModel()`

#### Phase 2: Quick Smoke Test (100% Complete) ✅
- [x] `smoke-tester.ts` - 8-test native capability assessment (~30 seconds)
  - Tests: RAG, tool selection, intent (no tool), multi-step, params, format, browser, reasoning
  - Trainability probe: retests failed tests with Level 1 prosthetic
  - Outputs: `nativeCapabilities`, `trainableCapabilities`, `blockedCapabilities`
- [x] API: `POST /api/tooly/smoke-test/:modelId`
- [x] API: `GET /api/tooly/smoke-test/:modelId` (get saved results)
- [x] API: `GET /api/tooly/smoke-test` (get test definitions)

#### Phase 3: Production Failure Monitoring (90% Complete) ✅
- [x] `failure-observer.ts` - Real-time pattern detection + WebSocket alerts
- [x] Wired failure logging to `intent-router.ts`
  - `logFailure()` and `reportRoutingFailure()` methods
  - Automatic pattern detection and observer notification
- [x] API endpoints for failures:
  - `GET /api/tooly/failures` - list with filters
  - `GET /api/tooly/failures/patterns` - grouped patterns
  - `GET /api/tooly/failures/stats` - statistics
  - `GET /api/tooly/failures/analysis` - summary for controller
  - `POST /api/tooly/failures/resolve` - mark as resolved
  - `POST /api/tooly/failures/:modelId/clear` - clear for model
- [ ] Wire CognitiveHUD to Sessions (deferred - needs WebSocket changes)

#### Phase 4: Controller Page (90% Complete) ✅
- [x] `Controller.tsx` - Full controller UI with:
  - Failure pattern list with severity badges
  - Recent failures feed
  - Controller analysis trigger
  - Prosthetic review and apply
  - Real-time alert display
- [x] Controller endpoints:
  - `GET /api/tooly/controller/status`
  - `POST /api/tooly/controller/start` / `stop`
  - `GET /api/tooly/controller/alerts`
  - `POST /api/tooly/controller/analyze` - trigger analysis
  - `POST /api/tooly/controller/apply-prosthetic`
- [ ] Test case generation from controller output (deferred - complex)

#### Phase 5: Capability-Based Routing (100% Complete) ✅
- [x] `intent-router.ts` updated with:
  - `detectRequiredCapability()` - infers capability from query
  - `isCapabilityBlocked()` / `getFallbackForCapability()`
  - Automatic routing to fallback model when capability blocked
- [x] Fallback chain in routing logic

#### Client Components (100% Complete) ✅
- [x] `Controller.tsx` page
- [x] `CapabilityMap.tsx` component
- [x] Route: `/tooly/controller`
- [x] Smoke Test button in ModelDetailPage
- [x] Dashboard failure badges - Red alert banner linking to Controller
- [x] `FailurePatternCard.tsx` - Expandable cards with severity styling
- [x] `ProstheticReview.tsx` - Full review/approve modal

### New Files Created

| File | Purpose |
|------|---------|
| `server/src/services/failure-log.ts` | JSON failure persistence |
| `server/src/services/failure-observer.ts` | Pattern detection + alerts |
| `server/src/services/combo-profile-store.ts` | Combo profile JSON export |
| `server/src/modules/tooly/testing/smoke-tester.ts` | Quick 8-test assessment |
| `client/src/pages/tooly/Controller.tsx` | Controller UI |
| `client/src/pages/tooly/components/CapabilityMap.tsx` | Capability visualization |
| `client/src/pages/tooly/components/FailurePatternCard.tsx` | Expandable failure cards |
| `client/src/pages/tooly/components/ProstheticReview.tsx` | Prosthetic approval modal |

### Files Modified

| File | Changes |
|------|---------|
| `server/src/modules/tooly/capabilities.ts` | Extended schema, new methods |
| `server/src/modules/tooly/intent-router.ts` | Failure logging, capability routing |
| `server/src/modules/tooly/cognitive-engine.ts` | Tool aliases, max iterations fallback, failure logging |
| `server/src/services/openai-proxy.ts` | Dual-model tool execution, streaming fixes |
| `server/src/routes/tooly.ts` | Smoke test, failure, controller endpoints |
| `rag-server/src/services/indexer.ts` | Fixed foreign key deletion order |
| `client/src/App.tsx` | Controller route |
| `client/src/pages/Dashboard.tsx` | Failure alert banner |
| `client/src/components/Layout.tsx` | Controller nav link |
| `client/src/pages/tooly/ModelDetailPage.tsx` | Smoke test button |

### Current Active Settings
```json
{
  "enableDualModel": true,
  "mainModelId": "qwen/qwen3-4b-2507",
  "executorModelId": "mistralai/ministral-3-3b"
}
```

### Services
| Service | Port | Purpose |
|---------|------|---------|
| Summy API | 3001 | Main Express server |
| RAG Server | 3002 | Semantic code search |
| RAG WebSocket | 3003 | Real-time progress |
| Continue MCP | 3006 | Extra tools (SSE) |

## Next Actions
1. Test prosthetic application end-to-end
2. Test smoke tests on new models
3. Clear old failure logs after fixes verified

## Fixes Applied This Session
1. **Controller analyze endpoint** - Added model field to LM Studio request
2. **JSON parsing** - Strip markdown fences, fix trailing commas, fix decimal format
3. **Tool aliases** - Added mappings for `ls`, `file_glob_search`, `grep` etc.
4. **Max iterations fallback** - Force summary response when loop hits limit
5. **Streaming** - Word-by-word streaming of final response

## Key Architecture Decisions

### Hybrid Testing Flow
```
Quick Smoke Test (30s) → Deploy → Log Failures → Controller Analyzes → Apply Prosthetic
        ↓                    ↓           ↓               ↓
  Native/Trainable     Production   failure-log.json   Qwen-32B
```

### Capability Categories
- **Native**: Works out of the box (score >= 70%)
- **Learned**: Improved with prosthetic (trained score >= 70%)
- **Blocked**: Not trainable, route to fallback model

### Controller Workflow (Manual)
1. User sees failures in Controller page
2. User loads Qwen-32B in LM Studio
3. User clicks "Analyze Failures"
4. Controller generates prosthetic + test cases
5. User reviews and approves
6. Prosthetic applied to model profile

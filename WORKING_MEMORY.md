# WORKING_MEMORY

## Current Goal
Self-Improving Agentic System - Build hybrid testing + production learning system

## Session Summary (Dec 26, 2024 - Night)

### Plan Created: Self-Improving Agentic System
**Plan file:** `c:\Users\Jerome\.cursor\plans\self-improving_agentic_system_0ee41105.plan.md`

### Key Decisions Made

1. **Hybrid Testing Approach (Option C)**
   - Quick smoke test (30s, 8 tests) before deployment
   - Deploy with monitoring, learn from real failures
   - Manual controller trigger (no auto hot-swap yet)

2. **Native vs Trainable Distinction**
   - Track `nativeScore` - works out of the box
   - Track `trainedScore` - after prosthetic applied
   - Track `trainable` - can learn (true/false/null)
   - `blockedCapabilities` - route to different model

3. **Controller Model: Manual First**
   - User loads Qwen-32B in LM Studio manually
   - User clicks "Analyze" in Controller page
   - Controller reads failure-log.json, generates prosthetic + tests
   - User reviews and approves
   - No auto hot-swap until validated

4. **JSON Storage (DB-independent)**
   - `server/data/failure-log.json` - failure persistence
   - `server/data/combo-profiles/` - combo test results
   - `server/data/model-profiles/*.json` - already exists (60+ profiles)
   - `server/data/prosthetic-prompts.json` - already exists

### Existing Infrastructure (Don't Rebuild!)

| Component | File | Status |
|-----------|------|--------|
| Model hot-swap | `server/src/services/lmstudio-model-manager.ts` | Ready |
| WebSocket broadcasts | `server/src/services/ws-broadcast.ts` | Ready |
| Prosthetic Loop | `server/src/modules/tooly/orchestrator/prosthetic-loop.ts` | Ready |
| Prosthetic Store | `server/src/modules/tooly/learning/prosthetic-store.ts` | Ready |
| Failure Detector | `server/src/modules/tooly/testing/failure-detector.ts` | Ready |
| CognitiveHUD | `client/src/pages/tooly/components/CognitiveHUD.tsx` | Needs wiring |
| Test Sandbox | `server/src/modules/tooly/test-sandbox.ts` | Ready |
| executeAgenticLoop | `server/src/modules/tooly/cognitive-engine.ts` | Ready |

### Files to Create

| File | Purpose |
|------|---------|
| `server/src/services/failure-log.ts` | JSON-based failure persistence |
| `server/src/services/failure-observer.ts` | Pattern detection + WS notifications |
| `server/src/modules/tooly/testing/smoke-tester.ts` | Quick 8-test assessment |
| `client/src/pages/tooly/Controller.tsx` | Meta-agent visibility UI |
| `client/src/pages/tooly/components/CapabilityMap.tsx` | Native/learned/blocked display |
| `client/src/pages/tooly/components/FailurePatternCard.tsx` | Grouped failures |
| `client/src/pages/tooly/components/ProstheticReview.tsx` | Approval modal |

### Model Profile Schema Extension

```json
{
  "capabilities": {
    "rag_query": { "nativeScore": 90, "trainedScore": null, "trainable": null },
    "multi_step": { "nativeScore": 35, "trainedScore": 78, "trainable": true }
  },
  "nativeStrengths": ["rag_query"],
  "learnedCapabilities": ["multi_step"],
  "blockedCapabilities": ["param_extraction"]
}
```

### 20 Tasks in Plan

**Phase 1 (Foundation):** failure-log, combo-json, profile-schema
**Phase 2 (Smoke Test):** smoke-tester, trainability, endpoint
**Phase 3 (Monitoring):** wire-logging, failure-observer, wire-hud
**Phase 4 (Controller):** controller-page, controller-endpoint, test-generator
**Phase 5 (Routing):** capability-routing, fallback-chain
**Client:** app-routes, smoke-ui, capability-map, dashboard-badges, failure-cards, prosthetic-review

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

## Next Actions
1. Start Phase 1: Create failure-log.ts
2. Extend model profile schema with capabilities
3. Add combo profile JSON export
4. Then proceed with smoke-tester in Phase 2

## Important Context
- Controller model: Qwen2.5-32B-Instruct (already in LM Studio)
- Hot-swap code exists in modelManager, just need endpoint for manual trigger
- CognitiveHUD exists, just needs WebSocket wiring to Sessions page
- Prosthetic teaching loop fully implemented, needs failure trigger

## Previous Session Work (Still Valid)
- CLI Dashboard created (`npm run dashboard`)
- Robust Intent Parser with 11+ tool call formats
- executeAgenticLoop fully implemented with rag_query, read_file, etc.
- Combo Testing at 100% pass rate

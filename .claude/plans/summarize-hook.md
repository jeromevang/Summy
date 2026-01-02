# Summarize Hook Implementation Plan

## Context Understanding

### Current State
- **Sessions System**: Summy tracks IDE conversation sessions in SQLite database
- **Existing Summarization**: `server/src/modules/tooly/context/summarizer.ts` provides AI-powered summarization using local LLM
- **Session Interface**: Already has `summary` field (`ContextSession.summary`) but not auto-populated
- **Claude Code Hooks**: Configuration in `.claude/settings.local.json`, supports 9 event types

### Key Files
- `.claude/settings.local.json` - Hook configuration
- `server/src/services/session-service.ts` - Session management
- `server/src/modules/tooly/context/summarizer.ts` - Summarization engine
- `server/src/routes/sessions.ts` - Sessions API
- `client/src/pages/Sessions.tsx` - Sessions UI (shows summary field)
- `WORKING_MEMORY.md` - Project context documentation

## Requirements (User Confirmed)

1. **Trigger**: "5 messages untouched - everything older gets summarized"
   - Rolling window approach: Keep last 5 messages fresh, summarize older content
   - Use UserPromptSubmit hook to check message count

2. **Scope**: Both Claude Code sessions AND Summy IDE sessions

3. **Output Locations**:
   - Summy session database (update `session.summary` field)
   - Dedicated log files: `.claude/summaries/YYYY-MM-DD.md`

4. **Method**: Use Summy's existing Summarizer (AI-powered via LMStudio)

## Implementation Design

### Hook Architecture

**Hook Event**: `UserPromptSubmit`
- Triggers before each user prompt is processed
- Checks conversation length in transcript
- If > 5 messages, summarizes older messages (excluding last 5)

### Components to Create

#### 1. Hook Script: `.claude/hooks/summarize-hook.js`
Node.js script that:
- Reads hook input from stdin (JSON with `transcript_path`, `cwd`, etc.)
- Parses transcript JSONL file
- Counts messages/turns
- If > 5 turns, extracts messages [0 to N-5] for summarization
- Calls Summy server API: `POST http://localhost:3001/api/summarize/conversation`
- Writes summary to `.claude/summaries/YYYY-MM-DD.md`
- Returns JSON with `decision: "approve"` to continue processing

#### 2. Summy API Endpoint: `server/src/routes/summarize.ts`
New route that:
- Accepts `POST /api/summarize/conversation`
- Body: `{ turns: Array<{role, content}>, sessionId?: string }`
- Uses existing `Summarizer.summarizeConversation()`
- If sessionId provided, updates database via `SessionService`
- Returns: `{ summary, keyTopics, pendingItems, importantFacts }`

#### 3. Hook Configuration: `.claude/settings.local.json`
Add to existing hooks object:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/summarize-hook.js",
            "timeout": 15000
          }
        ]
      }
    ]
  }
}
```

### Data Flow

```
User submits prompt
  → UserPromptSubmit hook fires
    → summarize-hook.js reads transcript_path
    → Counts messages in JSONL
    → IF count > 5:
        → Extract messages [0...count-5]
        → POST to Summy /api/summarize/conversation
          → Summy Summarizer generates summary
          → Updates database if sessionId provided
        → Hook writes to .claude/summaries/YYYY-MM-DD.md
    → Returns { decision: "approve" }
  → Claude Code continues processing prompt
```

### Summary Log Format

`.claude/summaries/2026-01-02.md`:
```markdown
# Conversation Summaries - January 2, 2026

## [14:30] Claude Code Session abc123

**Summary**: [AI-generated summary]

**Key Topics**: topic1, topic2, topic3

**Pending Items**:
- Task 1
- Task 2

**Important Facts**:
- Fact 1
- Fact 2

---

## [15:45] Summy IDE Session xyz789
...
```

### Critical Files to Modify

1. **Create**: `.claude/hooks/summarize-hook.js` - Main hook script (Node.js)
2. **Create**: `server/src/routes/summarize.ts` - New API endpoint
3. **Edit**: `server/src/routes/index.ts` - Export summarize route
4. **Edit**: `server/src/index.ts` - Register new route with `app.use('/api/summarize', summarizeRoutes)`
5. **Edit**: `.claude/settings.local.json` - Add UserPromptSubmit hook configuration
6. **Create**: `.claude/summaries/` - Directory for summary logs
7. **Edit**: `server/src/services/database.ts` - Add method to update session summary if needed

### Technical Details

**Hook Script Structure** (`.claude/hooks/summarize-hook.js`):
```javascript
// Read stdin JSON
// Parse transcript at transcript_path (JSONL format)
// Count turns, extract roles and content
// If count > 5:
//   - Extract turns [0...count-5] for summarization
//   - POST to http://localhost:3001/api/summarize/conversation
//   - Append result to .claude/summaries/YYYY-MM-DD.md
//   - Mark messages as "summarized" (metadata)
// Exit 0 with { decision: "approve" }
```

**API Endpoint Structure** (`server/src/routes/summarize.ts`):
```typescript
import { Router } from 'express';
import { summarizer } from '../modules/tooly/context/summarizer.js';
import { db } from '../services/database.js';

router.post('/conversation', async (req, res) => {
  const { turns, sessionId, claudeSessionId } = req.body;

  // Use existing Summarizer
  const result = await summarizer.summarizeConversation(turns);

  // Update Summy session database if sessionId provided
  if (sessionId) {
    db.updateSessionSummary(sessionId, result);
  }

  res.json(result);
});
```

**Hook Configuration Pattern**:
The hook will be non-blocking (exit 0) to ensure conversation flow continues.
Timeout set to 15 seconds to prevent hanging.
Failures logged but don't block user interaction.

## Implementation Steps

1. Create summarization API endpoint in Summy server
2. Create Node.js hook script
3. Add hook configuration to settings.local.json
4. Test with mock transcript
5. Verify summaries written to both database and log files
6. Document usage in CLAUDE.md

## Testing Plan

1. Start Summy server (ensure LMStudio is running)
2. Run Claude Code in project
3. Have conversation with >5 messages
4. Verify hook triggers on 6th message
5. Check `.claude/summaries/` for log file
6. Check Summy database for updated session.summary
7. Verify conversation continues normally (hook doesn't block)

## Edge Cases & Considerations

1. **Summy Server Offline**: Hook should fail gracefully without blocking Claude Code
2. **LMStudio Unavailable**: Summarizer falls back to extractive summarization
3. **Concurrent Sessions**: Each Claude Code session has unique transcript_path
4. **Summary Deduplication**: Track last summarized message index to avoid re-summarizing
5. **File Permissions**: Ensure `.claude/summaries/` is writable
6. **Large Transcripts**: Only read/parse necessary portions of JSONL file
7. **Database Schema**: Verify `sessions` table has `summary` field (or add migration)

## Success Criteria

✅ Hook triggers automatically after 5+ messages
✅ Summaries written to `.claude/summaries/YYYY-MM-DD.md`
✅ Summy session database updated with summary
✅ Conversation flow uninterrupted
✅ Graceful fallback if Summy server unavailable
✅ Summaries use AI when available, extractive when not
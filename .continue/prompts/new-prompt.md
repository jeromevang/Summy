---
name: sum
description: summarize current state into memory
invokable: true
---

You are in agent mode.

PRIMARY TASK:
Summarize the current state of the codebase, conversation, and tool outputs into WORKING_MEMORY.md.

CONTEXT MANAGEMENT RULES (MANDATORY):
- You have a limited context window.
- When the task reaches a stable checkpoint OR the conversation becomes long,
  you MUST write a summary.
- WORKING_MEMORY.md is the single source of truth.
  If something is not written there, it must not be assumed.
- Prefer summaries over repetition.
- Never paste full files or large outputs unless explicitly requested.

SUMMARIZATION FORMAT:
- Max 2000 tokens
- Bullet points only
- Include:
  - Goal
  - Key decisions
  - Assumptions
  - Open questions
  - Next actions
- Exclude:
  - Raw outputs
  - Redundant reasoning
  - Full code listings

OUTPUT RULES:
- Only output markdown content to be written to WORKING_MEMORY.md
- Do NOT output code blocks unless illustrating summaries

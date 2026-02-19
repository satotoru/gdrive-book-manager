#!/usr/bin/env bash
# Analyzes the session transcript and appends new development rules/patterns to CLAUDE.md.
# Runs on PreCompact and SessionEnd hooks.

set -euo pipefail

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Require both fields
[ -z "$TRANSCRIPT_PATH" ] || [ -z "$CWD" ] && exit 0

CLAUDE_MD="$CWD/CLAUDE.md"
[ -f "$CLAUDE_MD" ] || exit 0
[ -f "$TRANSCRIPT_PATH" ] || exit 0

# Extract text content from assistant/user messages (last 60 entries)
TRANSCRIPT_TEXT=$(tail -60 "$TRANSCRIPT_PATH" \
  | jq -r 'select(.type == "user" or .type == "assistant")
    | select(.message.content | type == "array")
    | .message.role + ": " + (.message.content[] | select(.type == "text") | .text // "")' \
  2>/dev/null | head -200)

[ -z "$TRANSCRIPT_TEXT" ] && exit 0

CURRENT_CLAUDE_MD=$(cat "$CLAUDE_MD")

PROMPT="You are reviewing a Claude Code session transcript for the gdrive-book-manager project.
Your job: identify any NEW development rules, patterns, or architectural decisions from this session
that are NOT already captured in CLAUDE.md, and should be preserved for future sessions.

Current CLAUDE.md:
---
${CURRENT_CLAUDE_MD}
---

Recent session transcript:
---
${TRANSCRIPT_TEXT}
---

Rules for output:
- If you found something new and worth adding, output ONLY the raw text to append (no markdown code fences, no explanations).
- The text must be self-contained and fit naturally at the end of CLAUDE.md.
- Keep it concise (1-5 lines max).
- Do NOT repeat content already in CLAUDE.md.
- If there is nothing new to add, output exactly: NO_UPDATES"

RESULT=$(claude -p "$PROMPT" 2>/dev/null || true)

if [ -n "$RESULT" ] && [ "$RESULT" != "NO_UPDATES" ]; then
  printf '\n%s\n' "$RESULT" >> "$CLAUDE_MD"
  echo "CLAUDE.md updated with new learnings." >&2
fi

exit 0

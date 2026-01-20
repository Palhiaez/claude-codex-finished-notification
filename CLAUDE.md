# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A notification system for AI coding assistants (Claude Code and Codex CLI) that sends notifications via Feishu webhook and Windows Toast when tasks complete. Runs in WSL2 environment, calling Windows Toast via `powershell.exe`.

## Commands

```bash
# Test Claude notification (simulates stop hook input)
npm test

# Manual run (reads JSON from stdin)
node notify.js

# Codex notification (pass JSON as argument)
python3 codex_notify.py '{"type":"agent_turn_complete", ...}'
```

## Architecture

```
notify.js              # Claude Code entry - reads stdin JSON, dispatches to notifiers
codex_notify.py        # Codex CLI entry - reads argv JSON, sends Feishu + Windows notifications
notifiers/
  feishu.js            # Sends Feishu webhook with card message
  windows.js           # Sends Windows Toast via powershell.exe WinRT
config.json            # Runtime config: enable flags, webhook URL, display duration
```

**Data Flow:**
1. Claude: Stop hook → stdin JSON `{event, transcript_path}` → `notify.js` → notifiers
2. Codex: notify config → argv JSON → `codex_notify.py` → HTTP/Toast directly

## Integration Points

- **Claude Code:** `.claude/settings.local.json` Stop hook calls `node notify.js`
- **Codex CLI:** `.codex/config.toml` notify array calls `codex_notify.py`

## Code Conventions

- ESM modules (`"type": "module"` in package.json)
- No external dependencies - uses Node 18+ native fetch and Python stdlib
- English JSDoc comments in JS; PEP8 snake_case in Python

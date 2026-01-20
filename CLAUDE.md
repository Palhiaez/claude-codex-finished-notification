# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A unified notification system for AI coding assistants (Claude Code and Codex CLI) that sends notifications via Feishu webhook and Windows Toast when tasks complete. Runs in WSL2 environment, calling Windows Toast via `powershell.exe`.

## Commands

```bash
# Test Claude Code notification (stdin mode)
echo '{"event":"stop","cwd":"/path/to/project"}' | node notify.js

# Test Codex CLI notification (argv mode)
node notify.js '{"type":"agent-turn-complete","last-assistant-message":"Task done","cwd":"/path/to/project"}'

# Run npm test
npm test
```

## Architecture

```
notify.js              # Unified entry point - handles both Claude (stdin) and Codex (argv)
notifiers/
  feishu.js            # Sends Feishu webhook with card message (green/blue based on source)
  windows.js           # Sends Windows Toast via powershell.exe WinRT
config.json            # Runtime config: enable flags, webhook URL, display duration
```

**Data Flow:**
1. Claude Code: Stop hook → stdin JSON `{event, transcript_path, cwd}` → `notify.js` → notifiers
2. Codex CLI: notify config → argv JSON `{type, last-assistant-message, cwd}` → `notify.js` → notifiers

**Source Detection:**
- If `process.argv[2]` exists → Codex CLI mode (blue theme)
- Otherwise → Claude Code mode (green theme)

## Integration Points

- **Claude Code:** `.claude/settings.local.json` Stop hook calls `node notify.js` via stdin
- **Codex CLI:** `.codex/config.toml` notify array calls `node notify.js` with JSON argument

## Code Conventions

- ESM modules (`"type": "module"` in package.json)
- No external dependencies - uses Node 18+ native fetch
- English JSDoc comments

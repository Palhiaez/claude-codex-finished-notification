# Claude/Codex Task Completion Notifier

A small Node.js notifier that sends task-completion summaries from **Claude Code** and **OpenAI Codex CLI** to Feishu (Lark) and/or Windows toast notifications. It supports both inputs:

- **Claude Code Stop hook**: reads JSON from stdin, uses `transcript_path` to extract the latest assistant summary.
- **Codex CLI notify**: reads JSON from argv and uses `last-assistant-message` as the summary.

## Features

- Feishu (Lark) interactive card notifications
- Windows toast notifications (WSL2 + PowerShell)
- Summary extraction and truncation for long messages
- Independent channel failures (one channel failing does not block others)

## Requirements

- Node.js (works without relying on Node 18+ built-ins)
- For Windows toast: WSL2 with access to `powershell.exe`

## Configuration

Copy `config.example.json` to `config.json` and edit:

```json
{
  "feishu": {
    "enabled": true,
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_ID"
  },
  "windows": {
    "enabled": false
  }
}
```

## Claude Code Stop Hook

Add a Stop hook in your Claude Code hooks configuration to run this script:

```json
{
  "hooks": {
    "Stop": [
      {
        "command": "node /absolute/path/to/notify.js"
      }
    ]
  }
}
```

The Stop hook provides JSON on stdin, including `transcript_path` and other session fields. This project reads that payload, extracts the latest assistant text from the transcript, and sends it as the summary.

## OpenAI Codex CLI notify

Configure Codex CLI to invoke this script on completion. Codex passes a JSON payload as an argument, and this project expects the `agent-turn-complete` event with `last-assistant-message`:

```toml
notify = ["node", "/absolute/path/to/notify.js"]
```

## Manual usage

Claude Code mode (stdin):

```bash
echo '{"event":"stop","transcript_path":"/tmp/test.jsonl"}' | node notify.js
```

Codex CLI mode (argv):

```bash
node notify.js '{"type":"agent-turn-complete","last-assistant-message":"Task done"}'
```

## Tests

```bash
npm test
```

## License

MIT

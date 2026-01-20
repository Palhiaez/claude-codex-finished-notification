# 项目概览

- 项目名称：claude-notify
- 目的：在对话/任务完成时发送通知（飞书 webhook + Windows Toast）。Claude Code 使用 Node 脚本；Codex CLI 使用 Python 脚本。
- 运行环境：Linux/WSL，Windows 通知通过 `powershell.exe` 调用 WinRT Toast。
- 入口/集成：
  - Claude：`.claude/settings.local.json` 里 Stop hook 调用 `node /home/qyqiao/scripts/claude-notify/notify.js`。
  - Codex：`.codex/config.toml` 的 `notify = ["python3", "/home/qyqiao/scripts/claude-notify/codex_notify.py"]`。
- 配置：`config.json`（feishu/windows 开关与参数）。
- 结构：
  - `notify.js`：Claude 通知主入口
  - `codex_notify.py`：Codex 通知主入口
  - `notifiers/feishu.js`：飞书 webhook
  - `notifiers/windows.js`：Windows Toast
  - `config.json`：配置
  - `package.json`：Node 项目信息与测试脚本

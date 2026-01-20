# 任务完成后的操作

- 本项目无既定 lint/format/test 流程；如需验证：
  - 手动运行 `npm test` 以验证 Claude 通知脚本
  - 手动运行 `python3 .../codex_notify.py '<json>'` 以验证 Codex 通知脚本
- 若涉及 Windows Toast：在 WSL 中确认 `powershell.exe` 可调用且通知未被系统禁用。

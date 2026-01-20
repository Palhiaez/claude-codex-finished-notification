#!/usr/bin/env python3
"""
Codex CLI notification script
Receives JSON from sys.argv[1] and sends notifications to Feishu and Windows
"""

import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

SCRIPT_DIR = Path(__file__).parent.resolve()
CONFIG_PATH = SCRIPT_DIR / "config.json"


def load_config():
    """Load configuration from config.json"""
    if not CONFIG_PATH.exists():
        print(f"[Codex Notify] Config file not found: {CONFIG_PATH}", file=sys.stderr)
        return None
    
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def truncate(text, max_len):
    """Truncate text to max length"""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


def send_feishu(config, title, summary, cwd=None):
    """Send notification to Feishu webhook"""
    feishu_cfg = config.get("feishu", {})
    if not feishu_cfg.get("enabled", False):
        return

    webhook_url = feishu_cfg.get("webhookUrl", "")
    if not webhook_url or "YOUR_WEBHOOK_ID" in webhook_url:
        print("[Codex Notify] Feishu webhook URL not configured", file=sys.stderr)
        return

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build elements array
    elements = [
        {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"📝 **Summary**\n{truncate(summary, 500)}"
            }
        }
    ]

    # Add working directory if available
    if cwd:
        elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": f"📁 **Working Dir**:  `{cwd}`"
            }
        })

    # Add footer with timestamp
    elements.append({"tag": "hr"})
    elements.append({
        "tag": "note",
        "elements": [
            {"tag": "plain_text", "content": f"🕐 {timestamp}"}
        ]
    })

    message = {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": title},
                "template": "blue",
                "ud_icon": {
                    "tag": "standard_icon",
                    "token": "done_outlined"
                }
            },
            "elements": elements
        }
    }
    
    try:
        data = json.dumps(message).encode("utf-8")
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if result.get("code", 0) != 0:
                print(f"[Codex Notify] Feishu error: {result}", file=sys.stderr)
    except Exception as e:
        print(f"[Codex Notify] Feishu request failed: {e}", file=sys.stderr)


def escape_for_powershell(s):
    """Escape string for PowerShell XML embedding"""
    return (s
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
        .replace("\n", " ")
        .replace("\r", ""))


def send_windows(config, title, content):
    """Send Windows toast notification via PowerShell"""
    win_cfg = config.get("windows", {})
    if not win_cfg.get("enabled", False):
        return
    
    safe_title = escape_for_powershell(truncate(title, 100))
    safe_content = escape_for_powershell(truncate(content, 200))
    
    ps_script = f'''
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast duration="short">
  <visual>
    <binding template="ToastText02">
      <text id="1">{safe_title}</text>
      <text id="2">{safe_content}</text>
    </binding>
  </visual>
  <audio silent="true"/>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Codex CLI")
$notifier.Show($toast)
'''
    
    try:
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            timeout=10
        )
    except Exception as e:
        print(f"[Codex Notify] Windows notification failed: {e}", file=sys.stderr)


def main():
    # Codex passes JSON as first argument
    if len(sys.argv) < 2:
        print("[Codex Notify] No JSON argument provided", file=sys.stderr)
        sys.exit(1)
    
    try:
        event = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(f"[Codex Notify] Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Only handle agent-turn-complete events
    event_type = event.get("type", "")
    if event_type != "agent-turn-complete":
        # Silently ignore other events
        sys.exit(0)
    
    config = load_config()
    if not config:
        sys.exit(1)

    # Extract message info
    summary = event.get("last-assistant-message", "Codex CLI session completed")
    cwd = event.get("cwd", "")

    # Build title
    title = "Codex CLI Task Completed"

    # Send notifications in parallel
    with ThreadPoolExecutor(max_workers=2) as executor:
        executor.submit(send_feishu, config, title, summary, cwd)
        executor.submit(send_windows, config, title, summary)


if __name__ == "__main__":
    main()

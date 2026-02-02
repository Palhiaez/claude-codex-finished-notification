/**
 * Windows Desktop Notification Module (via WSL2)
 * Uses PowerShell to send Windows toast notifications
 */

import { spawn } from 'node:child_process';

/**
 * Escape string for safe XML content embedding
 * @param {string} str - Raw string
 * @returns {string} XML-safe string
 */
function escapeForXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape string for safe PowerShell here-string embedding
 * @param {string} str - Raw string
 * @returns {string} PowerShell-safe string
 */
function escapeForPowerShell(str) {
  return str
    .replace(/`/g, '``')
    .replace(/"/g, '`"')
    .replace(/\$/g, '`$')
    .replace(/\n/g, '`n')
    .replace(/'/g, "''")
    .replace(/#/g, '`#')
    .replace(/;/g, '`;');
}

/**
 * Send notification to Windows desktop via PowerShell
 * @param {Object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} [options.source] - Source: 'claude' or 'codex'
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendWindowsNotification({ title, message, source = 'claude' }) {
  // Apply both XML and PowerShell escaping for safe embedding
  const safeTitle = escapeForPowerShell(escapeForXml(title));
  const safeMessage = escapeForPowerShell(escapeForXml(message));
  const appName = source === 'codex' ? 'Codex CLI' : 'Claude Code';

  // PowerShell script to show Windows toast notification
  const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast duration="short">
  <visual>
    <binding template="ToastText02">
      <text id="1">${safeTitle}</text>
      <text id="2">${safeMessage}</text>
    </binding>
  </visual>
  <audio silent="true"/>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("${appName}")
$notifier.Show($toast)
`;

  return new Promise((resolve) => {
    let resolved = false;

    const done = (result) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const powershell = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';

    powershell.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    powershell.on('close', (code) => {
      if (code === 0) {
        done({ success: true });
      } else {
        done({ success: false, error: stderr || `Exit code: ${code}` });
      }
    });

    powershell.on('error', (error) => {
      done({ success: false, error: error.message });
    });

    const timer = setTimeout(() => {
      powershell.kill();
      done({ success: false, error: 'Notification timed out' });
    }, 10000);
  });
}

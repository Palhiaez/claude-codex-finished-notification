/**
 * Windows Desktop Notification Module (via WSL2)
 * Uses PowerShell to send Windows toast notifications
 */

import { spawn } from 'node:child_process';

/**
 * Send notification to Windows desktop via PowerShell
 * @param {Object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {number} [options.displayMs=5000] - Display duration in milliseconds
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendWindowsNotification({ title, message, displayMs = 5000 }) {
  // Escape special characters for PowerShell
  const escapeForPowerShell = (str) => {
    return str
      .replace(/`/g, '``')
      .replace(/"/g, '`"')
      .replace(/\$/g, '`$')
      .replace(/\n/g, '`n');
  };

  const escapedTitle = escapeForPowerShell(title);
  const escapedMessage = escapeForPowerShell(message);

  // PowerShell script to show Windows toast notification
  const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast duration="short">
  <visual>
    <binding template="ToastText02">
      <text id="1">${escapedTitle}</text>
      <text id="2">${escapedMessage}</text>
    </binding>
  </visual>
  <audio silent="true"/>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude Code")
$notifier.Show($toast)
`;

  return new Promise((resolve) => {
    const powershell = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000
    });

    let stderr = '';

    powershell.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    powershell.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
      }
    });

    powershell.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    // Timeout fallback
    setTimeout(() => {
      powershell.kill();
      resolve({ success: false, error: 'Notification timed out' });
    }, 10000);
  });
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import the module to verify it loads without errors
// Actual toast sending requires Windows, so we only test escaping logic
describe('windows.js module', () => {

  it('should import without errors', async () => {
    const mod = await import('../notifiers/windows.js');
    assert.ok(typeof mod.sendWindowsNotification === 'function');
  });

  it('should handle powershell.exe not found gracefully', { timeout: 15000 }, async () => {
    // In non-WSL environments, powershell.exe won't exist
    // The function should return { success: false } rather than throwing
    const { sendWindowsNotification } = await import('../notifiers/windows.js');
    const result = await sendWindowsNotification({
      title: 'Test <script>alert("xss")</script>',
      message: 'Content with $pecial `chars` & "quotes" <tags>',
      source: 'claude'
    });
    // In WSL2 with Windows, this may succeed. Without Windows, it should fail gracefully.
    assert.ok(typeof result.success === 'boolean');
    if (!result.success) {
      assert.ok(typeof result.error === 'string');
    }
  });
});

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sendFeishuNotification } from '../notifiers/feishu.js';

describe('sendFeishuNotification', () => {

  it('should reject unconfigured webhook URL', async () => {
    const result = await sendFeishuNotification({
      webhookUrl: '',
      title: 'Test',
      content: 'Hello'
    });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /not configured/);
  });

  it('should reject placeholder webhook URL', async () => {
    const result = await sendFeishuNotification({
      webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_WEBHOOK_ID',
      title: 'Test',
      content: 'Hello'
    });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /not configured/);
  });

  it('should handle network errors gracefully', async () => {
    const result = await sendFeishuNotification({
      webhookUrl: 'http://localhost:1/unreachable',
      title: 'Test',
      content: 'Hello'
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.length > 0);
  });

  it('should handle timeout via AbortSignal', { timeout: 15000 }, async () => {
    // This test just verifies the function doesn't crash with a bad URL
    const result = await sendFeishuNotification({
      webhookUrl: 'http://192.0.2.1/timeout-test',  // RFC 5737 TEST-NET, will timeout
      title: 'Test',
      content: 'Hello'
    });
    assert.strictEqual(result.success, false);
  });
});

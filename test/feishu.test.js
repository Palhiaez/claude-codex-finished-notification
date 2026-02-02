import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendFeishuNotification } from '../notifiers/feishu.js';

describe('sendFeishuNotification', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  });

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
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };
    const result = await sendFeishuNotification({
      webhookUrl: 'http://localhost:1/unreachable',
      title: 'Test',
      content: 'Hello'
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.length > 0);
  });

  it('should handle abort errors gracefully', async () => {
    globalThis.fetch = async () => {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      throw error;
    };
    const result = await sendFeishuNotification({
      webhookUrl: 'http://example.com/abort-test',
      title: 'Test',
      content: 'Hello'
    });
    assert.strictEqual(result.success, false);
  });

  it('should handle non-200 responses', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({})
    });
    const result = await sendFeishuNotification({
      webhookUrl: 'http://example.com/server-error',
      title: 'Test',
      content: 'Hello'
    });
    assert.strictEqual(result.success, false);
    assert.match(result.error, /HTTP 500/);
  });
});

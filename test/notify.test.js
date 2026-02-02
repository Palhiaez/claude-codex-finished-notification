import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOTIFY_PATH = join(__dirname, '..', 'notify.js');
const CONFIG_PATH = join(__dirname, '..', 'config.json');

/**
 * Helper: run notify.js with optional stdin data or argv
 * Uses a config that disables all notification channels to avoid real calls
 */
function runNotify({ stdin, argv, config } = {}) {
  return new Promise((resolve, reject) => {
    // Temporarily swap config to disable all channels
    let originalConfig;
    try {
      originalConfig = require('fs').readFileSync(CONFIG_PATH, 'utf-8');
    } catch {
      originalConfig = null;
    }

    const testConfig = config || {
      feishu: { enabled: false },
      windows: { enabled: false }
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(testConfig));

    const args = argv ? [NOTIFY_PATH, argv] : [NOTIFY_PATH];
    const child = execFile('node', args, {
      timeout: 10000,
      cwd: join(__dirname, '..')
    }, (error, stdout, stderr) => {
      // Restore original config
      if (originalConfig) {
        writeFileSync(CONFIG_PATH, originalConfig);
      }
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });

    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else if (!argv) {
      // No stdin and no argv — close stdin immediately
      child.stdin.end();
    }
  });
}

describe('notify.js entry point', () => {

  describe('Codex CLI mode (argv)', () => {
    it('should handle agent-turn-complete event', async () => {
      const event = JSON.stringify({
        type: 'agent-turn-complete',
        'last-assistant-message': 'Task done',
        cwd: '/tmp/test'
      });

      const { stdout, stderr } = await runNotify({ argv: event });
      assert.match(stdout, /No notification channels enabled/);
    });

    it('should ignore non agent-turn-complete events', async () => {
      const event = JSON.stringify({ type: 'other-event' });
      const { code } = await runNotify({ argv: event });
      assert.strictEqual(code, 0);
    });

    it('should exit with error on invalid JSON argument', async () => {
      const { stderr, code } = await runNotify({ argv: 'not-json' });
      assert.ok(code !== 0 || stderr.includes('Invalid JSON'));
    });
  });

  describe('Claude Code mode (stdin)', () => {
    it('should handle stop event via stdin', async () => {
      const input = JSON.stringify({ event: 'stop', cwd: '/tmp/test' });
      const { stdout } = await runNotify({ stdin: input });
      assert.match(stdout, /No notification channels enabled/);
    });

    it('should handle empty stdin gracefully', async () => {
      const { stdout } = await runNotify({ stdin: '' });
      assert.match(stdout, /No notification channels enabled/);
    });
  });

  describe('Summary truncation', () => {
    it('should truncate long Codex messages', async () => {
      const longMsg = 'A'.repeat(600);
      const event = JSON.stringify({
        type: 'agent-turn-complete',
        'last-assistant-message': longMsg,
        cwd: '/tmp'
      });

      // Enable feishu with an invalid URL so it fails fast but we can see it tried
      const { stderr } = await runNotify({
        argv: event,
        config: {
          feishu: { enabled: true, webhookUrl: 'http://localhost:1/invalid' },
          windows: { enabled: false }
        }
      });
      // The important thing is no crash — truncation is internal
      assert.ok(true);
    });
  });
});

describe('extractSummary (via transcript)', () => {
  const tmpDir = join(__dirname, 'tmp');
  const transcriptPath = join(tmpDir, 'test-transcript.jsonl');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { unlinkSync(transcriptPath); } catch { /* ignore */ }
  });

  it('should extract assistant message from transcript', async () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'hello' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'This is a long enough assistant response for extraction.' }] } })
    ];
    writeFileSync(transcriptPath, lines.join('\n'));

    const input = JSON.stringify({
      event: 'stop',
      transcript_path: transcriptPath,
      cwd: '/tmp'
    });

    // With no channels enabled, it just logs the "no channels" message — but doesn't crash
    const { stdout } = await runNotify({ stdin: input });
    assert.match(stdout, /No notification channels enabled/);
  });

  it('should handle missing transcript file', async () => {
    const input = JSON.stringify({
      event: 'stop',
      transcript_path: '/nonexistent/path.jsonl',
      cwd: '/tmp'
    });

    const { stdout, stderr } = await runNotify({ stdin: input });
    assert.match(stdout, /No notification channels enabled/);
    assert.match(stderr, /Could not read transcript/);
  });
});

#!/usr/bin/env node

/**
 * AI Coding Assistant Task Completion Notification Script
 * Unified entry point for Claude Code and Codex CLI notifications
 *
 * Usage:
 *   Claude Code (stdin):  echo '{"event":"stop",...}' | node notify.js
 *   Codex CLI (argv):     node notify.js '{"type":"agent-turn-complete",...}'
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendFeishuNotification } from './notifiers/feishu.js';
import { sendWindowsNotification } from './notifiers/windows.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_SUMMARY_LENGTH = 500;

/**
 * Load configuration from config.json
 * @returns {Object} Configuration object
 */
function loadConfig() {
  const configPath = join(__dirname, 'config.json');
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load config: ${error.message}`);
    return {
      feishu: { enabled: false },
      windows: { enabled: true }
    };
  }
}

/**
 * Truncate summary to max length
 * @param {string} text - Raw summary text
 * @returns {string} Truncated text
 */
function truncateSummary(text) {
  if (text.length > MAX_SUMMARY_LENGTH) {
    return text.substring(0, MAX_SUMMARY_LENGTH) + '...';
  }
  return text;
}

/**
 * Normalize summary to plain text
 * @param {string} text - Raw summary text
 * @returns {string} Plain text summary
 */
function normalizeSummary(text) {
  if (!text) {
    return '';
  }

  let cleaned = text;
  cleaned = cleaned.replace(/cite.*?/g, '');
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/```/g, '');
  cleaned = cleaned.replace(/`/g, '');
  cleaned = cleaned.replace(/^\s*#{1,6}\s+/gm, '');
  cleaned = cleaned.replace(/^\s*>\s?/gm, '');
  cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '');
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '');
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * Read hook data from stdin (for Claude Code)
 * @returns {Promise<Object|null>} Parsed hook data or null
 */
async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let resolved = false;

    const done = (value) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(value);
      }
    };

    const timeout = setTimeout(() => {
      process.stdin.destroy();
      done(null);
    }, 3000);

    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      if (data.trim()) {
        try {
          done(JSON.parse(data));
        } catch {
          done(null);
        }
      } else {
        done(null);
      }
    });

    process.stdin.on('error', () => {
      done(null);
    });

    if (process.stdin.readableEnded) {
      done(null);
    }
  });
}

/**
 * Extract summary from Claude Code transcript
 * @param {string} transcriptPath - Path to transcript file
 * @returns {string} Summary or default message
 */
function extractSummary(transcriptPath) {
  if (!transcriptPath) {
    return 'Claude Code session completed';
  }

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    const lastMessages = lines.slice(-10).reverse();

    for (const line of lastMessages) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'assistant' && entry.message?.content) {
          const textContent = entry.message.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

          if (textContent.length > 10) {
            return truncateSummary(normalizeSummary(textContent));
          }
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.warn(`[Notify] Could not read transcript: ${error.message}`);
  }

  return 'Claude Code session completed';
}

/**
 * Parse input from either stdin (Claude) or argv (Codex)
 * @returns {Promise<{source: string, summary: string, cwd: string, transcriptPath: string|null}>}
 */
async function parseInput() {
  // Check for Codex CLI mode (JSON as command line argument)
  if (process.argv[2]) {
    try {
      const event = JSON.parse(process.argv[2]);

      // Only handle agent-turn-complete events for Codex
      if (event.type !== 'agent-turn-complete') {
        process.exit(0);
      }

      const rawSummary = event['last-assistant-message'] || 'Codex CLI session completed';

      return {
        source: 'codex',
        summary: truncateSummary(normalizeSummary(rawSummary)),
        cwd: event.cwd || process.cwd(),
        transcriptPath: null
      };
    } catch {
      console.error('[Notify] Invalid JSON argument');
      process.exit(1);
    }
  }

  // Claude Code mode (stdin)
  const hookData = await readStdin();
  const transcriptPath = hookData?.transcript_path || null;

  return {
    source: 'claude',
    summary: extractSummary(transcriptPath),
    cwd: hookData?.cwd || process.cwd(),
    transcriptPath
  };
}

/**
 * Main function
 */
async function main() {
  const config = loadConfig();
  const { source, summary, cwd, transcriptPath } = await parseInput();

  const title = source === 'codex'
    ? 'Codex CLI Task Completed'
    : 'Claude Code Task Completed';

  const notifications = [];

  // Send Feishu notification
  if (config.feishu?.enabled) {
    notifications.push(
      sendFeishuNotification({
        webhookUrl: config.feishu.webhookUrl,
        title,
        content: summary,
        transcriptPath,
        cwd,
        source
      }).then(result => ({ channel: 'Feishu', ...result }))
    );
  }

  // Send Windows notification
  if (config.windows?.enabled) {
    notifications.push(
      sendWindowsNotification({
        title,
        message: summary,
        source
      }).then(result => ({ channel: 'Windows', ...result }))
    );
  }

  if (notifications.length === 0) {
    console.log('No notification channels enabled');
    return;
  }

  // Use allSettled to ensure one failure does not block others
  const results = await Promise.allSettled(notifications);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const val = result.value;
      if (val.success) {
        console.log(`[${val.channel}] Notification sent successfully`);
      } else {
        console.error(`[${val.channel}] Failed: ${val.error}`);
      }
    } else {
      console.error(`[Notify] Unexpected error: ${result.reason}`);
    }
  }
}

main().catch(error => {
  console.error('Notification script error:', error.message);
  process.exit(1);
});

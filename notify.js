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
      windows: { enabled: true, displayMs: 5000 }
    };
  }
}

/**
 * Read hook data from stdin (for Claude Code)
 * @returns {Promise<Object|null>} Parsed hook data or null
 */
async function readStdin() {
  return new Promise((resolve) => {
    let data = '';

    const timeout = setTimeout(() => {
      resolve(null);
    }, 3000);

    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      if (data.trim()) {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });

    process.stdin.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    if (process.stdin.readableEnded) {
      clearTimeout(timeout);
      resolve(null);
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
            return textContent.length > 200
              ? textContent.substring(0, 200) + '...'
              : textContent;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore read errors
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

      return {
        source: 'codex',
        summary: event['last-assistant-message'] || 'Codex CLI session completed',
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
        displayMs: config.windows.displayMs,
        source
      }).then(result => ({ channel: 'Windows', ...result }))
    );
  }

  if (notifications.length === 0) {
    console.log('No notification channels enabled');
    return;
  }

  const results = await Promise.all(notifications);

  for (const result of results) {
    if (result.success) {
      console.log(`[${result.channel}] Notification sent successfully`);
    } else {
      console.error(`[${result.channel}] Failed: ${result.error}`);
    }
  }
}

main().catch(error => {
  console.error('Notification script error:', error.message);
  process.exit(1);
});

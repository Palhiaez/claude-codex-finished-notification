#!/usr/bin/env node

/**
 * Claude Code Task Completion Notification Script
 * Main entry point for the notification system
 *
 * Usage: This script is triggered by Claude Code's Stop hook
 * It reads hook data from stdin and sends notifications to configured channels
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
 * Read hook data from stdin
 * @returns {Promise<Object|null>} Parsed hook data or null
 */
async function readStdin() {
  return new Promise((resolve) => {
    let data = '';

    // Set timeout for stdin read
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

    // Handle case where stdin is already closed
    if (process.stdin.readableEnded) {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

/**
 * Extract summary from transcript if available
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

    // Get the last few messages to find summary
    const lastMessages = lines.slice(-10).reverse();

    for (const line of lastMessages) {
      try {
        const entry = JSON.parse(line);
        // Look for assistant's final message
        if (entry.type === 'assistant' && entry.message?.content) {
          const textContent = entry.message.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

          if (textContent.length > 10) {
            // Truncate if too long
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
 * Main function
 */
async function main() {
  const config = loadConfig();
  const hookData = await readStdin();

  const transcriptPath = hookData?.transcript_path || null;
  const cwd = hookData?.cwd || process.cwd();
  const summary = extractSummary(transcriptPath);

  const title = 'Claude Code Task Completed';
  const notifications = [];

  // Send Feishu notification
  if (config.feishu?.enabled) {
    notifications.push(
      sendFeishuNotification({
        webhookUrl: config.feishu.webhookUrl,
        title,
        content: summary,
        transcriptPath,
        cwd
      }).then(result => ({ channel: 'Feishu', ...result }))
    );
  }

  // Send Windows notification
  if (config.windows?.enabled) {
    notifications.push(
      sendWindowsNotification({
        title,
        message: summary,
        displayMs: config.windows.displayMs
      }).then(result => ({ channel: 'Windows', ...result }))
    );
  }

  if (notifications.length === 0) {
    console.log('No notification channels enabled');
    return;
  }

  // Wait for all notifications
  const results = await Promise.all(notifications);

  // Log results
  for (const result of results) {
    if (result.success) {
      console.log(`[${result.channel}] Notification sent successfully`);
    } else {
      console.error(`[${result.channel}] Failed: ${result.error}`);
    }
  }
}

// Run main
main().catch(error => {
  console.error('Notification script error:', error.message);
  process.exit(1);
});

/**
 * Feishu (Lark) Webhook Notification Module
 * Sends rich text messages to Feishu via Webhook
 */

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const REQUEST_TIMEOUT_MS = 10000;

async function postJson(url, payload, timeoutMs) {
  if (typeof fetch === 'function') {
    return postJsonWithFetch(url, payload, timeoutMs);
  }
  return postJsonWithNode(url, payload, timeoutMs);
}

async function postJsonWithFetch(url, payload, timeoutMs) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };

  let response;
  if (typeof AbortController === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } else {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
    });
    try {
      response = await Promise.race([fetch(url, options), timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json
  };
}

function postJsonWithNode(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
      return;
    }

    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const data = JSON.stringify(payload);

    const req = requestFn({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = body ? JSON.parse(body) : null;
        } catch {
          json = null;
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          json
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'));
    });
    req.write(data);
    req.end();
  });
}

/**
 * Send notification to Feishu webhook
 * @param {Object} options - Notification options
 * @param {string} options.webhookUrl - Feishu webhook URL
 * @param {string} options.title - Message title
 * @param {string} options.content - Message content
 * @param {string} [options.transcriptPath] - Path to transcript file
 * @param {string} [options.cwd] - Working directory
 * @param {string} [options.source] - Source: 'claude' (green) or 'codex' (blue)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendFeishuNotification({ webhookUrl, title, content, transcriptPath, cwd, source = 'claude' }) {
  if (!webhookUrl || webhookUrl.includes('YOUR_WEBHOOK_ID')) {
    return { success: false, error: 'Feishu webhook URL not configured' };
  }

  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // Build elements array
  const elements = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📝 **Summary**\n${content}`
      }
    }
  ];

  // Add working directory if available
  if (cwd) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📁 **Working Dir**:  \`${cwd}\``
      }
    });
  }

  // Add transcript path if available
  if (transcriptPath) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `📄 **Transcript**:  \`${transcriptPath}\``
      }
    });
  }

  // Add footer with timestamp
  elements.push(
    { tag: 'hr' },
    {
      tag: 'note',
      elements: [
        { tag: 'plain_text', content: `🕐 ${timestamp}` }
      ]
    }
  );

  // Build rich text message
  const message = {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: title
        },
        template: source === 'codex' ? 'blue' : 'green',
        ud_icon: {
          tag: 'standard_icon',
          token: 'done_outlined'
        }
      },
      elements
    }
  };

  try {
    const response = await postJson(webhookUrl, message, REQUEST_TIMEOUT_MS);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    if (!response.json) {
      return { success: false, error: 'Invalid JSON response' };
    }

    const result = response.json;

    if (result.code === 0 || result.StatusCode === 0) {
      return { success: true };
    } else {
      return { success: false, error: result.msg || result.StatusMessage || 'Unknown error' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

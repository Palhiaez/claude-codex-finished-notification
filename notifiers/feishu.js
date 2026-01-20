/**
 * Feishu (Lark) Webhook Notification Module
 * Sends rich text messages to Feishu via Webhook
 */

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
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    const result = await response.json();

    if (result.code === 0 || result.StatusCode === 0) {
      return { success: true };
    } else {
      return { success: false, error: result.msg || result.StatusMessage || 'Unknown error' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

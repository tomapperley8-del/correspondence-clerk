/**
 * Gmail Web Email Extractor
 * Extracts email data from Gmail Web DOM (mail.google.com)
 *
 * Usage:
 *   const emailData = extractGmailEmail();
 *   console.log(emailData);
 */

(function() {
  'use strict';

  /**
   * Extract email metadata (message ID, web link)
   * @returns {Object} Email source metadata
   */
  function extractEmailMetadata() {
    const metadata = {
      message_id: null,
      thread_id: null,
      web_link: null,
      import_source: 'gmail_web'
    };

    try {
      const url = new URL(window.location.href);

      // Gmail URL structure: mail.google.com/mail/u/0/#inbox/THREAD_ID
      // The hash contains the thread/message ID
      const hash = window.location.hash;

      if (hash) {
        // Extract thread ID from hash (e.g., #inbox/FMfcgzQXJWDKqLPNkMvBhLVnxBGVVqKk)
        const parts = hash.split('/');
        if (parts.length >= 2) {
          metadata.thread_id = parts[parts.length - 1];
        }
      }

      // Try to find message ID from data attributes
      const messageEl = document.querySelector('[data-message-id]') ||
                        document.querySelector('[data-legacy-message-id]');

      if (messageEl) {
        metadata.message_id = messageEl.getAttribute('data-message-id') ||
                             messageEl.getAttribute('data-legacy-message-id');
      }

      // Always capture web link
      metadata.web_link = window.location.href;

    } catch (error) {
      console.warn('Could not extract email metadata:', error);
      metadata.web_link = window.location.href;
    }

    return metadata;
  }

  /**
   * Parse email address from text
   * Handles: "Name <email@domain.com>" or "email@domain.com"
   */
  function parseEmailAddress(text) {
    if (!text) {
      return { email: '', name: '' };
    }

    const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/;
    const match = text.match(emailRegex);
    const email = match ? match[0] : '';

    // Extract name if present
    let name = '';
    if (text.includes('<') && text.includes('>')) {
      name = text.substring(0, text.indexOf('<')).trim();
    } else if (text !== email && !text.includes('@')) {
      name = text.trim();
    }

    return { email, name };
  }

  /**
   * Extract plain text from HTML element
   */
  function extractBodyText(element) {
    if (!element) return '';

    // Clone to avoid modifying original
    const clone = element.cloneNode(true);

    // Remove signature blocks
    const signatures = clone.querySelectorAll('.gmail_signature, [data-smartmail="gmail_signature"]');
    signatures.forEach(sig => sig.remove());

    // Remove quoted text (replied emails)
    const quoted = clone.querySelectorAll('.gmail_quote, [class*="gmail_quote"]');
    quoted.forEach(q => q.remove());

    // Remove extra menu elements that Gmail adds
    const menus = clone.querySelectorAll('[role="menu"], [role="menubar"]');
    menus.forEach(m => m.remove());

    // Get plain text
    let text = clone.textContent || clone.innerText || '';

    // Clean up whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * Build raw content in format expected by Correspondence Clerk
   */
  function buildRawContent(subject, from, to, date, body) {
    const fromStr = from.name ? `${from.name} <${from.email}>` : from.email;
    const toStr = to.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ');
    const dateStr = new Date(date).toLocaleString('en-GB');

    return `From: ${fromStr}
To: ${toStr}
Date: ${dateStr}
Subject: ${subject}

${body}`;
  }

  /**
   * Extract email data from Gmail Web
   * @returns {Object|null} Email data or null if extraction fails
   */
  window.extractGmailEmail = function() {
    try {
      // Extract email metadata first
      const emailMetadata = extractEmailMetadata();

      // Gmail uses various selectors depending on UI state
      // Try to find the email content container

      // Method 1: Find the expanded message view
      let emailContainer = document.querySelector('[data-message-id]');

      // Method 2: Find via role and aria attributes
      if (!emailContainer) {
        emailContainer = document.querySelector('[role="listitem"][data-message-id]');
      }

      // Method 3: Find via gmail's main content area
      if (!emailContainer) {
        emailContainer = document.querySelector('.nH.aHU');
      }

      // Method 4: Look for message body container
      if (!emailContainer) {
        emailContainer = document.querySelector('.adn.ads');
      }

      let subject = '';
      let body = '';
      let from = { email: '', name: '' };
      let to = [];
      let date = new Date().toISOString();

      // Extract subject - Gmail uses h2 with specific data attributes or class
      const subjectSelectors = [
        'h2[data-thread-perm-id]',
        'h2.hP',
        'div.ha h2',
        '[data-legacy-thread-id] h2',
        'h2[data-subject]'
      ];

      for (const selector of subjectSelectors) {
        const subjectEl = document.querySelector(selector);
        if (subjectEl && subjectEl.textContent) {
          subject = subjectEl.textContent.trim();
          break;
        }
      }

      // Fallback: look for subject in any h2 inside main content
      if (!subject) {
        const mainH2s = document.querySelectorAll('[role="main"] h2');
        for (const h2 of mainH2s) {
          const text = h2.textContent.trim();
          if (text && text.length > 0 && text.length < 500) {
            subject = text;
            break;
          }
        }
      }

      // Extract sender (from)
      // Gmail shows sender in various elements
      const fromSelectors = [
        '[email][name]', // Element with both email and name attributes
        '.gD', // Sender name element
        'span[email]', // Span with email attribute
        '[data-hovercard-id]', // Hovercard element (contains email)
        '.go' // From header
      ];

      for (const selector of fromSelectors) {
        const fromEl = document.querySelector(selector);
        if (fromEl) {
          const emailAttr = fromEl.getAttribute('email');
          const nameAttr = fromEl.getAttribute('name') || fromEl.textContent.trim();

          if (emailAttr) {
            from = { email: emailAttr, name: nameAttr || '' };
            break;
          } else {
            // Try to parse from text
            const fromText = fromEl.textContent.trim();
            const parsed = parseEmailAddress(fromText);
            if (parsed.email) {
              from = parsed;
              break;
            }
          }
        }
      }

      // Fallback: look for email-like text in header area
      if (!from.email) {
        const headerArea = document.querySelector('.ha, .hI, .gE');
        if (headerArea) {
          const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/;
          const match = headerArea.textContent.match(emailRegex);
          if (match) {
            from.email = match[0];
          }
        }
      }

      // Extract recipients (to)
      const toSelectors = [
        '.hb span[email]', // To field
        '.g2', // Recipient spans
      ];

      for (const selector of toSelectors) {
        const toEls = document.querySelectorAll(selector);
        if (toEls.length > 0) {
          to = Array.from(toEls).map(el => {
            const emailAttr = el.getAttribute('email');
            const nameAttr = el.getAttribute('name') || el.textContent.trim();
            return emailAttr ? { email: emailAttr, name: nameAttr || '' } : parseEmailAddress(el.textContent);
          }).filter(t => t.email);
          if (to.length > 0) break;
        }
      }

      // Extract date
      // Gmail shows date in various formats
      const dateSelectors = [
        '.g3', // Date element
        'span[data-timestamp]',
        '.gK span',
        '[alt*="at"]' // "Jan 15, 2025 at 3:45 PM" pattern
      ];

      for (const selector of dateSelectors) {
        const dateEl = document.querySelector(selector);
        if (dateEl) {
          // Try timestamp attribute first
          const timestamp = dateEl.getAttribute('data-timestamp');
          if (timestamp) {
            const parsed = new Date(parseInt(timestamp));
            if (!isNaN(parsed.getTime())) {
              date = parsed.toISOString();
              break;
            }
          }

          // Try title attribute (often contains full date)
          const title = dateEl.getAttribute('title');
          if (title) {
            const parsed = new Date(title);
            if (!isNaN(parsed.getTime())) {
              date = parsed.toISOString();
              break;
            }
          }

          // Try text content
          const dateText = dateEl.textContent.trim();
          if (dateText) {
            const parsed = new Date(dateText);
            if (!isNaN(parsed.getTime())) {
              date = parsed.toISOString();
              break;
            }
          }
        }
      }

      // Extract body
      // Gmail email body is in a div with specific classes
      const bodySelectors = [
        '.a3s.aiL', // Main email body
        '.a3s', // Email body container
        '[data-message-id] .ii.gt', // Message content
        '.ii.gt', // Alternative body selector
        '.adn.ads .ii' // Another pattern
      ];

      for (const selector of bodySelectors) {
        const bodyEl = document.querySelector(selector);
        if (bodyEl) {
          body = extractBodyText(bodyEl);
          if (body) break;
        }
      }

      // If still no body, try to get any message content
      if (!body) {
        const messageDiv = document.querySelector('[data-message-id]');
        if (messageDiv) {
          body = extractBodyText(messageDiv);
        }
      }

      if (!body) {
        throw new Error('Could not extract email body from Gmail');
      }

      // Build raw content
      const rawContent = buildRawContent(subject, from, to, date, body);

      return {
        subject,
        body,
        from,
        to: to.length > 0 ? to : [parseEmailAddress('')],
        date,
        raw_content: rawContent,
        email_source: emailMetadata
      };

    } catch (error) {
      console.error('Gmail extraction error:', error);
      return {
        error: error.message,
        subject: '',
        body: '',
        from: { email: '', name: '' },
        to: [],
        date: new Date().toISOString(),
        raw_content: '',
        email_source: {
          message_id: null,
          thread_id: null,
          web_link: window.location.href,
          import_source: 'gmail_web'
        }
      };
    }
  };

})();

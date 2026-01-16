/**
 * Outlook Web Email Extractor
 * Extracts email data from Outlook Web DOM (outlook.com and Office 365)
 * 
 * Usage:
 *   const emailData = extractOutlookEmail();
 *   console.log(emailData);
 */

(function() {
  'use strict';

  /**
   * Extract email data from Outlook Web
   * @returns {Object|null} Email data or null if extraction fails
   */
  window.extractOutlookEmail = function() {
    try {
      // Try new Outlook interface (modern)
      if (document.querySelector('[data-testid="message-header"]')) {
        return extractModernOutlook();
      }
      
      // Try classic Outlook interface
      if (document.querySelector('#ReadingPaneContainerId')) {
        return extractClassicOutlook();
      }
      
      // Try Outlook.com (consumer)
      if (document.querySelector('[role="main"]')) {
        return extractOutlookCom();
      }
      
      throw new Error('Could not detect Outlook Web interface');
    } catch (error) {
      console.error('Outlook extraction error:', error);
      return {
        error: error.message,
        subject: '',
        body: '',
        from: { email: '', name: '' },
        to: [],
        date: new Date().toISOString(),
        raw_content: ''
      };
    }
  };

  /**
   * Extract from modern Outlook (Office 365)
   */
  function extractModernOutlook() {
    const header = document.querySelector('[data-testid="message-header"]');
    const body = document.querySelector('[data-testid="message-body"]') || 
                 document.querySelector('[role="document"]') ||
                 document.querySelector('.allowTextSelection');

    if (!header || !body) {
      throw new Error('Could not find email content in modern Outlook');
    }

    // Extract subject
    const subjectEl = header.querySelector('[data-testid="message-subject"]') ||
                     header.querySelector('h2') ||
                     header.querySelector('div[title]');
    const subject = subjectEl?.textContent?.trim() || '';

    // Extract from
    const fromEl = header.querySelector('[data-testid="message-sender"]') ||
                  header.querySelector('[title*="@"]');
    const fromText = fromEl?.textContent?.trim() || '';
    const from = parseEmailAddress(fromText);

    // Extract to (recipients)
    const toEls = header.querySelectorAll('[data-testid="message-recipient"]') ||
                 header.querySelectorAll('span[title*="@"]');
    const to = Array.from(toEls).map(el => {
      const text = el.textContent?.trim() || el.title || '';
      return parseEmailAddress(text);
    });

    // Extract date
    const dateEl = header.querySelector('time') ||
                  header.querySelector('[data-testid="message-date"]');
    let date = new Date().toISOString();
    if (dateEl) {
      const dateStr = dateEl.getAttribute('datetime') || dateEl.textContent?.trim();
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString();
        }
      }
    }

    // Extract body (convert HTML to plain text)
    const bodyText = extractBodyText(body);

    // Build raw content
    const rawContent = buildRawContent(subject, from, to, date, bodyText);

    return {
      subject,
      body: bodyText,
      from,
      to: to.length > 0 ? to : [parseEmailAddress('')],
      date,
      raw_content: rawContent
    };
  }

  /**
   * Extract from classic Outlook (older Office 365)
   */
  function extractClassicOutlook() {
    const readingPane = document.querySelector('#ReadingPaneContainerId');
    if (!readingPane) {
      throw new Error('Could not find reading pane in classic Outlook');
    }

    // Extract subject
    const subjectEl = readingPane.querySelector('div[aria-label*="Subject"]') ||
                     readingPane.querySelector('span[id*="subject"]') ||
                     readingPane.querySelector('div[role="heading"]');
    const subject = subjectEl?.textContent?.trim() || '';

    // Extract from
    const fromEl = readingPane.querySelector('span[id*="sender"]') ||
                  readingPane.querySelector('div[aria-label*="From"]');
    const fromText = fromEl?.textContent?.trim() || '';
    const from = parseEmailAddress(fromText);

    // Extract to
    const toEls = readingPane.querySelectorAll('span[id*="recipient"]') ||
                 readingPane.querySelectorAll('div[aria-label*="To"]');
    const to = Array.from(toEls).map(el => {
      const text = el.textContent?.trim() || '';
      return parseEmailAddress(text);
    });

    // Extract date
    const dateEl = readingPane.querySelector('span[id*="date"]') ||
                  readingPane.querySelector('time');
    let date = new Date().toISOString();
    if (dateEl) {
      const dateStr = dateEl.getAttribute('datetime') || dateEl.textContent?.trim();
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString();
        }
      }
    }

    // Extract body
    const bodyEl = readingPane.querySelector('div[id*="body"]') ||
                  readingPane.querySelector('[role="document"]');
    const bodyText = bodyEl ? extractBodyText(bodyEl) : '';

    const rawContent = buildRawContent(subject, from, to, date, bodyText);

    return {
      subject,
      body: bodyText,
      from,
      to: to.length > 0 ? to : [parseEmailAddress('')],
      date,
      raw_content: rawContent
    };
  }

  /**
   * Extract from Outlook.com (consumer)
   */
  function extractOutlookCom() {
    const main = document.querySelector('[role="main"]');
    if (!main) {
      throw new Error('Could not find main content in Outlook.com');
    }

    // Extract subject
    const subjectEl = main.querySelector('h2') ||
                     main.querySelector('[data-testid="subject"]') ||
                     main.querySelector('div[aria-label*="Subject"]');
    const subject = subjectEl?.textContent?.trim() || '';

    // Extract from
    const fromEl = main.querySelector('[data-testid="sender"]') ||
                  main.querySelector('span[title*="@"]') ||
                  main.querySelector('div[aria-label*="From"]');
    const fromText = fromEl?.textContent?.trim() || fromEl?.title || '';
    const from = parseEmailAddress(fromText);

    // Extract to
    const toEls = main.querySelectorAll('[data-testid="recipient"]') ||
                 main.querySelectorAll('span[title*="@"]');
    const to = Array.from(toEls).map(el => {
      const text = el.textContent?.trim() || el.title || '';
      return parseEmailAddress(text);
    });

    // Extract date
    const dateEl = main.querySelector('time') ||
                  main.querySelector('[data-testid="date"]');
    let date = new Date().toISOString();
    if (dateEl) {
      const dateStr = dateEl.getAttribute('datetime') || dateEl.textContent?.trim();
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString();
        }
      }
    }

    // Extract body
    const bodyEl = main.querySelector('[role="document"]') ||
                  main.querySelector('.allowTextSelection') ||
                  main.querySelector('div[id*="body"]');
    const bodyText = bodyEl ? extractBodyText(bodyEl) : '';

    const rawContent = buildRawContent(subject, from, to, date, bodyText);

    return {
      subject,
      body: bodyText,
      from,
      to: to.length > 0 ? to : [parseEmailAddress('')],
      date,
      raw_content: rawContent
    };
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

    // Remove signature blocks and quoted text
    const signatures = clone.querySelectorAll('[class*="signature"], [id*="signature"]');
    signatures.forEach(sig => sig.remove());

    // Remove quoted/replied content (common patterns)
    const quoted = clone.querySelectorAll('[class*="quote"], [class*="reply"]');
    quoted.forEach(q => q.remove());

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

})();

/**
 * Outlook Bookmarklet for Correspondence Clerk
 * 
 * This script extracts email data from Outlook Web and opens Correspondence Clerk
 * with the form pre-filled, or creates the entry directly if business/contact matched.
 * 
 * Installation:
 * 1. Copy the minified bookmarklet code
 * 2. Create a new bookmark in your browser
 * 3. Paste the code as the URL
 * 4. Click the bookmark while viewing an email in Outlook Web
 * 
 * Or use the HTML version below for easier installation:
 */

(function() {
  'use strict';

  /**
   * Main bookmarklet function
   */
  function sendToCorrespondenceClerk() {
    // Check if we're in Outlook Web
    if (!window.location.hostname.includes('outlook') && 
        !window.location.hostname.includes('office.com') &&
        !window.location.hostname.includes('live.com')) {
      alert('Please open this bookmarklet while viewing an email in Outlook Web.');
      return;
    }

    // Load extractor if not already loaded
    if (!window.extractOutlookEmail) {
      loadExtractor();
      // Wait a moment for extractor to load
      setTimeout(processEmail, 500);
    } else {
      processEmail();
    }
  }

  /**
   * Load the email extractor script
   */
  function loadExtractor() {
    const script = document.createElement('script');
    script.src = getCorrespondenceClerkUrl() + '/outlook-extractor.js';
    script.onerror = function() {
      alert('Could not load email extractor. Please ensure Correspondence Clerk is accessible.');
    };
    document.head.appendChild(script);
  }

  /**
   * Get Correspondence Clerk base URL
   * Defaults to current hostname or can be configured
   */
  function getCorrespondenceClerkUrl() {
    // Try to get from localStorage or use default
    const savedUrl = localStorage.getItem('correspondenceClerkUrl');
    if (savedUrl) {
      return savedUrl;
    }
    
    // Default: assume localhost for development, or use window.location.origin
    // User can configure this in the bookmarklet settings
    const defaultUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : 'https://correspondence-clerk.vercel.app'; // Production URL
    
    return defaultUrl;
  }

  /**
   * Process the email and send to Correspondence Clerk
   */
  function processEmail() {
    try {
      // Extract email data
      const emailData = window.extractOutlookEmail();
      
      if (!emailData || emailData.error) {
        alert('Could not extract email data. Error: ' + (emailData?.error || 'Unknown error'));
        return;
      }

      // Build pre-fill URL with query parameters
      const params = new URLSearchParams({
        emailSubject: emailData.subject || '',
        emailBody: emailData.body || '',
        emailFrom: emailData.from.name 
          ? `${emailData.from.name} <${emailData.from.email}>`
          : emailData.from.email,
        emailDate: emailData.date,
        emailTo: emailData.to.map(t => 
          t.name ? `${t.name} <${t.email}>` : t.email
        ).join(', '),
        emailRawContent: encodeURIComponent(emailData.raw_content || ''),
      });

      const correspondenceClerkUrl = getCorrespondenceClerkUrl();
      const prefillUrl = `${correspondenceClerkUrl}/new-entry?${params.toString()}`;

      // Open Correspondence Clerk in new tab
      window.open(prefillUrl, '_blank');

    } catch (error) {
      console.error('Bookmarklet error:', error);
      alert('Error processing email: ' + error.message);
    }
  }

  // Run the bookmarklet
  sendToCorrespondenceClerk();
})();

/**
 * Minified version for bookmarklet use:
 * 
 * Copy this code and use it as a bookmark URL:
 */
/*
javascript:(function(){function sendToCorrespondenceClerk(){if(!window.location.hostname.includes('outlook')&&!window.location.hostname.includes('office.com')&&!window.location.hostname.includes('live.com')){alert('Please open this bookmarklet while viewing an email in Outlook Web.');return;}if(!window.extractOutlookEmail){loadExtractor();setTimeout(processEmail,500);}else{processEmail();}}function loadExtractor(){var script=document.createElement('script');script.src=getCorrespondenceClerkUrl()+'/outlook-extractor.js';script.onerror=function(){alert('Could not load email extractor. Please ensure Correspondence Clerk is accessible.');};document.head.appendChild(script);}function getCorrespondenceClerkUrl(){var savedUrl=localStorage.getItem('correspondenceClerkUrl');if(savedUrl)return savedUrl;var defaultUrl=window.location.hostname==='localhost'?'http://localhost:3000':'https://correspondence-clerk.vercel.app';return defaultUrl;}function processEmail(){try{var emailData=window.extractOutlookEmail();if(!emailData||emailData.error){alert('Could not extract email data. Error: '+(emailData?.error||'Unknown error'));return;}var params=new URLSearchParams({emailSubject:emailData.subject||'',emailBody:emailData.body||'',emailFrom:emailData.from.name?emailData.from.name+' <'+emailData.from.email+'>':emailData.from.email,emailDate:emailData.date,emailTo:emailData.to.map(function(t){return t.name?t.name+' <'+t.email+'>':t.email;}).join(', '),emailRawContent:encodeURIComponent(emailData.raw_content||'')});var correspondenceClerkUrl=getCorrespondenceClerkUrl();var prefillUrl=correspondenceClerkUrl+'/new-entry?'+params.toString();window.open(prefillUrl,'_blank');}catch(error){console.error('Bookmarklet error:',error);alert('Error processing email: '+error.message);}}sendToCorrespondenceClerk();})();
*/

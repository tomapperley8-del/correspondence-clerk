# Outlook Integration for Correspondence Clerk

Send emails directly from Outlook Web to Correspondence Clerk with one click.

**🚀 Easiest Installation:** Visit the [Bookmarklet Installer](https://correspondence-clerk.vercel.app/install-bookmarklet) for a drag-and-drop installation page.

**✅ Status:** Fully working and tested (January 21, 2026)

## Important Technical Notes

**Implementation:** The installer is a Next.js page at `/app/install-bookmarklet/page.tsx`, not a static HTML file. This is critical because:
- React blocks `javascript:` URLs for security
- We bypass this using `useEffect` to set the href after mount
- Static HTML files caused URL encoding corruption (`%27` instead of quotes)
- The Next.js approach generates clean, working bookmarklet code

**Production URL:** `https://correspondence-clerk.vercel.app` (not the long deployment preview URLs)

## How It Works

The Outlook integration uses a browser bookmarklet that:
1. Extracts email data (subject, body, sender, date) from Outlook Web
2. Opens Correspondence Clerk with the form pre-filled
3. Optionally auto-matches business/contact from email addresses

## Installation

### Method 1: Bookmarklet (Recommended)

1. **Copy the bookmarklet code:**
   
   Open `public/outlook-bookmarklet.js` in your browser and copy the minified version, or use the HTML installer below.

2. **Create a bookmark:**
   - Chrome/Edge: Press `Ctrl+Shift+O` (or `Cmd+Shift+O` on Mac) to open bookmarks manager
   - Create a new bookmark
   - Name it: "Send to Correspondence Clerk"
   - For the URL, paste this code (update the URL to match your Correspondence Clerk instance):

   ```javascript
   javascript:(function(){var url='https://correspondence-clerk.vercel.app';if(!window.location.hostname.includes('outlook')&&!window.location.hostname.includes('office.com')&&!window.location.hostname.includes('live.com')){alert('Please open this bookmarklet while viewing an email in Outlook Web.');return;}var script=document.createElement('script');script.src=url+'/outlook-extractor.js';script.onload=function(){try{var emailData=window.extractOutlookEmail();if(!emailData||emailData.error){alert('Could not extract email data: '+(emailData?.error||'Unknown'));return;}var params=new URLSearchParams({emailSubject:emailData.subject||'',emailBody:emailData.body||'',emailFrom:emailData.from.name?emailData.from.name+' <'+emailData.from.email+'>':emailData.from.email,emailDate:emailData.date,emailTo:emailData.to.map(function(t){return t.name?t.name+' <'+t.email+'>':t.email;}).join(', '),emailRawContent:encodeURIComponent(emailData.raw_content||'')});window.open(url+'/new-entry?'+params.toString(),'_blank');}catch(e){alert('Error: '+e.message);}};script.onerror=function(){alert('Could not load email extractor. Is Correspondence Clerk running?');};document.head.appendChild(script);})();
   ```

   **Production URL:** This code points to the production server. For local development, replace the URL with `http://localhost:3000`

3. **Update the URL (if needed):**
   - The code above uses the production URL
   - For local development: Replace with `http://localhost:3000` (or 3001 if that's your port)

4. **Save the bookmark**

### Method 2: Next.js Installer Page (Recommended)

**This is the recommended and tested method.**

A full-featured installer page is available at:
[https://correspondence-clerk.vercel.app/install-bookmarklet](https://correspondence-clerk.vercel.app/install-bookmarklet)

**Source:** `/app/install-bookmarklet/page.tsx`

This page includes:
- Drag-and-drop bookmarklet installation (bypasses React security blocking)
- Toggle between Production and Local Dev versions
- Step-by-step instructions
- Troubleshooting guide
- Chiswick Calendar theme styling

**Why this works:** The Next.js page uses `useEffect` and `ref` to set the bookmarklet href after mount, bypassing React's security blocking of `javascript:` URLs.

Or create a simple HTML page locally with this content (save as `bookmarklet-installer.html`):

```html
<!DOCTYPE html>
<html>
<head>
  <title>Install Correspondence Clerk Bookmarklet</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    .bookmarklet { display: inline-block; padding: 10px 20px; background: #2563eb; color: white;
                   text-decoration: none; border: none; cursor: pointer; }
    .bookmarklet:hover { background: #1d4ed8; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Install Outlook Integration</h1>
  <p>Drag this button to your bookmarks bar:</p>
  <a href="javascript:(function(){var url='https://correspondence-clerk.vercel.app';if(!window.location.hostname.includes('outlook')&&!window.location.hostname.includes('office.com')&&!window.location.hostname.includes('live.com')){alert('Please open this bookmarklet while viewing an email in Outlook Web.');return;}var script=document.createElement('script');script.src=url+'/outlook-extractor.js';script.onload=function(){try{var emailData=window.extractOutlookEmail();if(!emailData||emailData.error){alert('Could not extract email data: '+(emailData?.error||'Unknown'));return;}var params=new URLSearchParams({emailSubject:emailData.subject||'',emailBody:emailData.body||'',emailFrom:emailData.from.name?emailData.from.name+' <'+emailData.from.email+'>':emailData.from.email,emailDate:emailData.date,emailTo:emailData.to.map(function(t){return t.name?t.name+' <'+t.email+'>':t.email;}).join(', '),emailRawContent:encodeURIComponent(emailData.raw_content||'')});window.open(url+'/new-entry?'+params.toString(),'_blank');}catch(e){alert('Error: '+e.message);}};script.onerror=function(){alert('Could not load email extractor. Is Correspondence Clerk running?');};document.head.appendChild(script);})();" class="bookmarklet">📧 Send to Correspondence Clerk</a>

  <h2>Update URL for Local Development</h2>
  <p>The button above uses the production URL. For local development, update the <code>url</code> variable in the bookmarklet code:</p>
  <ul>
    <li><strong>Local development:</strong> <code>http://localhost:3000</code> (or 3001 if that's your port)</li>
    <li><strong>Production:</strong> <code>https://correspondence-clerk.vercel.app</code> (already set)</li>
  </ul>

  <h2>How to Use</h2>
  <ol>
    <li>Open an email in Outlook Web</li>
    <li>Click the bookmarklet in your bookmarks bar</li>
    <li>Correspondence Clerk opens with the form pre-filled</li>
    <li>Select business and contact (or use auto-matched if available)</li>
    <li>Click "Save Entry"</li>
  </ol>
</body>
</html>
```

Open this HTML file in your browser and drag the button to your bookmarks bar.

## Usage

1. **Open an email in Outlook Web** (outlook.com, Office 365, etc.)
2. **Click the bookmarklet** in your bookmarks bar
3. **Correspondence Clerk opens** in a new tab with:
   - Email subject pre-filled
   - Email body pre-filled in the text area
   - Entry date/time from email
   - Entry type set to "Email"
   - Direction (sent/received) auto-detected
   - Business/contact auto-matched if email address matches a contact

4. **Verify business and contact** (or select manually)
5. **Click "Save Entry"**

## Features

### Auto-Matching

If the email sender's address matches a contact in Correspondence Clerk:
- Business and contact are automatically selected
- You can change them before saving if needed

### Email Threads

For email threads/conversations:
- The bookmarklet extracts the full thread
- Correspondence Clerk's thread detection will split it automatically
- You can review the split before saving

### Pre-filled Fields

When importing from Outlook:
- **Subject:** Copied from email subject
- **Body:** Email body text (HTML converted to plain text)
- **Date/Time:** From email date header
- **Type:** Automatically set to "Email"
- **Direction:** Auto-detected (sent vs received)

## Troubleshooting

### "Could not extract email data"

**Problem:** The bookmarklet can't find the email content in Outlook Web.

**Solutions:**
- Make sure you're viewing the email (not just the inbox)
- Try clicking directly on the email to open it in the reading pane
- Some Outlook Web layouts may not be supported yet

### "Could not load email extractor"

**Problem:** The extractor script can't be loaded.

**Solutions:**
- Make sure Correspondence Clerk is running and accessible
- Check that the URL in the bookmarklet matches your Correspondence Clerk URL
- Verify `outlook-extractor.js` is accessible at `your-url/outlook-extractor.js`

### Bookmarklet doesn't work

**Problem:** Clicking the bookmarklet doesn't do anything.

**Solutions:**
- Make sure you're on an Outlook Web page (outlook.com, office.com)
- Check browser console for errors (F12 → Console tab)
- Try refreshing the page and clicking again

### Wrong email extracted

**Problem:** The bookmarklet extracts a different email than expected.

**Solutions:**
- Make sure the email you want is fully loaded and visible
- Click directly on the email you want to import
- Try scrolling to the top of the email thread

## Supported Outlook Versions

- ✅ Outlook.com (consumer)
- ✅ Office 365 Outlook Web (modern interface)
- ✅ Office 365 Outlook Web (classic interface)
- ❌ Outlook Desktop (not supported - use Outlook Web instead)
- ❌ Outlook Mobile (not supported)

## API Endpoint

The integration uses the `/api/import-email` endpoint:

**POST** `/api/import-email`

**Request:**
```json
{
  "subject": "Email subject",
  "body": "Email body text",
  "from": { "email": "sender@example.com", "name": "Sender Name" },
  "to": [{ "email": "recipient@example.com", "name": "Recipient Name" }],
  "date": "2026-01-16T14:30:00Z",
  "raw_content": "Full email text with headers",
  "business_id": "optional-uuid",
  "contact_id": "optional-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "prefillUrl": "/new-entry?emailSubject=...",
  "matched": {
    "business_id": "uuid-or-null",
    "contact_id": "uuid-or-null"
  }
}
```

## Security

- Email content is sent to Correspondence Clerk via URL parameters (for pre-fill) or API
- Ensure you're using HTTPS in production
- Email data is only sent to your Correspondence Clerk instance
- Authentication is required (must be logged in to Correspondence Clerk)

## Known Limitations (As of January 21, 2026)

1. **Thread Detection:** Currently extracts only the most recent email in a thread, not the full conversation history. Thread splitting needs to be improved.

2. **Contact Matching:** If an email address already exists but with a different contact name, the system tries to create a duplicate rather than offering to edit the existing contact. This needs enhancement.

3. **Email Threads:** The bookmarklet doesn't detect when viewing an email thread with multiple messages. It only extracts the visible/latest message.

## Future Enhancements

- Chrome/Edge browser extension (better UI)
- Desktop Outlook integration (VBA script or Add-in)
- Auto-save without opening form (if business/contact matched)
- Support for email attachments
- Batch import multiple emails

# Correspondence Clerk Help

## Getting Started

**What is this?** A digital filing system for business correspondence - emails, calls, and meetings.

**How to add an entry:**
1. Click **New Entry**
2. Select a business (or add one)
3. Select a contact (or add one)
4. Paste or type your content
5. Click **Save Entry**

## Import Emails

Import emails with one click using the bookmarklet.

**Setup:** Go to [Install Email Tool](/install-bookmarklet) and drag the button to your bookmarks bar.

**Use:** Open an email in Outlook or Gmail, click the bookmarklet, then save.

## CC Contacts

When filing an entry, you can add CC contacts - other people involved in the correspondence.

After selecting the primary contact, check the boxes next to any additional contacts to include them.

## Search

Use the search bar to find past correspondence by business name or keyword.

## Troubleshooting

**Bookmarklet not working?**
- Make sure you're using Outlook Web or Gmail (not desktop apps)
- Make sure the email is fully loaded

**Can't save?**
- Business and contact are required
- Entry text is required
- For emails, direction (sent/received) is required

**AI formatting failed?**
- Click "Save Without Formatting" - your text is preserved
- You can format later when the service is available

## Inbound Email

Receive emails directly into Correspondence Clerk without copying and pasting.

**Two ways to use it:**

1. **Forward received emails** — Set up email forwarding in your email client to `your-token@in.correspondenceclerk.com`. Find your token in [Settings](/settings) under Inbound Email.

2. **BCC capture for sent emails** — BCC `your-token@in.correspondenceclerk.com` when sending from your email client. The email is captured as a sent entry.

**What happens:**
- Emails from known domains are filed automatically
- Unknown senders appear in the [Inbox](/inbox) for manual triage
- Forwarded content (quoted text) is stripped before AI formatting

**Inbox triage:**
- Each queued email shows SENT or RECEIVED badge, a preview, and suggested contact
- Click to file — select or confirm the business and contact, then save

## Actions

The [Actions page](/actions) shows what needs attention:

- **Priority** — flagged entries or items with due dates
- **Needs Reply** — received emails with no reply logged
- **Gone Quiet** — businesses you haven't contacted in a while
- **Reminders** — entries with upcoming due dates

Navigate with **j/k** keys, press **Space** to expand an entry.

## AI Assistant (Daily Briefing)

The AI Assistant is an AI chat panel that knows your business context.

- Click **Daily Briefing** in the nav, or open it as a slide-out from any page
- Ask things like "What needs chasing?", "Any expiring contracts?", or "Summarise my week"
- The AI uses your organisation's business description and industry for context

## Bulk Email Import

Import emails from Gmail or Outlook in bulk.

1. Go to [Import Gmail](/import/gmail) or [Import Outlook](/import/outlook)
2. Connect your email account with OAuth
3. Review the suggested business/contact matches
4. Confirm and import — emails are processed in batches

## Need Help?

Contact your administrator or check the [Settings](/settings) page.

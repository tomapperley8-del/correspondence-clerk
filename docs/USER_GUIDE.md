# Correspondence Clerk Help

## Getting Started

**What is this?** A digital filing system for business correspondence - emails, calls, and meetings.

**How to add an entry:**
1. Go to **Inbox** and click **+ New Entry** (or navigate directly to /new-entry)
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

Press **Ctrl+K** (or **Cmd+K** on Mac) to open the search overlay. Find past correspondence by business name or keyword.

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

## To-dos

Your home page. A single view of everything that needs your attention, organised by urgency.

**Top Priorities** — the 5 most urgent items, shown at the top.

**Sections (collapsed by default):**

- **Needs Reply** — received emails where you haven't logged a response yet. Amber for 3–6 days, red for 7+.
- **Actions Due** — flagged entries with due dates approaching or past, plus reminders.
- **Renewals** — businesses with contracts ending within 30 days.

**How items get here:**

- Flag any email as "Follow-up" from the business page — one click sets a 7-day due date automatically.
- When the AI formats a received email and detects a high-confidence action (e.g. a question requiring a response), it flags it automatically.
- From Insights, click "Add to Actions" on any business insight card.

**Taking action:**

- **Done** — marks the item resolved and removes it permanently.
- **Snooze** — push it back 3 days, 1 week, or 1 month.
- **Reply / Log** — opens an inline panel. Choose type (Call, Email, or Note), set date and time, write what happened. Check "Mark original as done" to close the source item in one step.

**Keyboard shortcuts:** `↑ ↓` navigate · `D` done · `S` snooze 7 days · `L` reply / log

## Insights

The AI Insights panel on each business page generates contextual analysis — call prep, next best actions, risk checks, and more.

- Click **Generate** on any insight card to create a fresh analysis
- The AI uses your organisation's business description and correspondence history for context

## Bulk Email Import

Import emails from Gmail or Outlook in bulk.

1. Go to [Import Gmail](/import/gmail) or [Import Outlook](/import/outlook)
2. Connect your email account with OAuth
3. Review the suggested business/contact matches
4. Confirm and import — emails are processed in batches

## Need Help?

Contact your administrator or check the [Settings](/settings) page.

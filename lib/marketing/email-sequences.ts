/**
 * Email sequence definitions for automated nurture flows
 * Sequences trigger on events like trial_started, purchase_completed, etc.
 */

export interface EmailSequence {
  name: string
  description: string
  trigger_event: 'trial_started' | 'purchase_completed' | 'trial_ending' | 'referral_signup' | 'lead_captured' | 'review_request'
  steps: EmailStep[]
}

export interface EmailStep {
  step_number: number
  delay_days: number
  delay_hours: number
  subject: string
  body_template: string
  goal: string
}

/**
 * Trial Started Sequence
 * Onboards new trial users
 */
export const TRIAL_STARTED_SEQUENCE: EmailSequence = {
  name: 'Trial Started',
  description: 'Welcome and onboard new trial users',
  trigger_event: 'trial_started',
  steps: [
    {
      step_number: 1,
      delay_days: 0,
      delay_hours: 0,
      subject: 'Welcome to Correspondence Clerk - Quick Start Guide',
      body_template: `Hi {{name}},

Welcome to Correspondence Clerk. Your 14-day free trial has started.

Here's how to get the most out of your trial:

1. Add your first business
   Go to Dashboard > Add Business and enter a company you correspond with.

2. Log your first piece of correspondence
   Click "New Entry" and paste any email or letter text. Our AI will format it automatically.

3. Install the email bookmarklet (optional)
   Settings > Tools to import emails directly from Outlook or Gmail.

That's it. Start filing your correspondence today and never lose track of an important exchange again.

Questions? Just reply to this email.

The Correspondence Clerk Team`,
      goal: 'Get user to add first entry',
    },
    {
      step_number: 2,
      delay_days: 3,
      delay_hours: 0,
      subject: 'Import emails directly from Outlook or Gmail',
      body_template: `Hi {{name}},

Did you know you can import emails directly into Correspondence Clerk without copy-pasting?

Install our bookmarklet:
1. Go to Settings > Tools in Correspondence Clerk
2. Drag the bookmarklet to your bookmarks bar
3. Open any email in Outlook or Gmail
4. Click the bookmarklet to import it instantly

It works with email threads too - we'll detect and format each message in the chain.

Try it with your next important email.

The Correspondence Clerk Team`,
      goal: 'Get user to use email import',
    },
    {
      step_number: 3,
      delay_days: 7,
      delay_hours: 0,
      subject: 'How other businesses use Correspondence Clerk',
      body_template: `Hi {{name}},

Here's how businesses like yours are using Correspondence Clerk:

Estate Agents
"We track every offer letter and property enquiry. Nothing slips through the cracks anymore."

Solicitors
"Client correspondence is always at our fingertips. Essential for professional liability."

Accountants
"HMRC letters, client queries, all in one place. Searching is instant."

Magazine Publishers
"Advertiser correspondence, contributor contracts - organised and accessible."

What will you use it for? If you need help setting up your workflow, reply to this email.

The Correspondence Clerk Team`,
      goal: 'Show social proof and use cases',
    },
    {
      step_number: 4,
      delay_days: 12,
      delay_hours: 0,
      subject: 'Your trial ends in 2 days',
      body_template: `Hi {{name}},

Your Correspondence Clerk trial ends in 2 days.

So far you've logged {{entry_count}} pieces of correspondence. Don't lose access to this data.

Subscribe now to:
- Keep all your filed correspondence
- Continue using AI-powered formatting
- Access your data from anywhere

Subscribe here: {{upgrade_url}}

If you have questions or need more time, just reply to this email.

The Correspondence Clerk Team`,
      goal: 'Create urgency for conversion',
    },
    {
      step_number: 5,
      delay_days: 14,
      delay_hours: 0,
      subject: 'Your trial has ended - 20% off to continue',
      body_template: `Hi {{name}},

Your Correspondence Clerk trial ended today.

As a thank you for trying us, here's 20% off your first 3 months:
Use code TRIALEND20 at checkout.

Subscribe now: {{upgrade_url}}

Your data is safe - we keep it for 30 days after trial expiry. But you won't be able to access it or add new entries until you subscribe.

Questions? Reply to this email.

The Correspondence Clerk Team`,
      goal: 'Convert with discount',
    },
  ],
}

/**
 * Purchase Completed Sequence
 * Activates and retains paying customers
 */
export const PURCHASE_COMPLETED_SEQUENCE: EmailSequence = {
  name: 'Purchase Completed',
  description: 'Thank and activate new paying customers',
  trigger_event: 'purchase_completed',
  steps: [
    {
      step_number: 1,
      delay_days: 0,
      delay_hours: 0,
      subject: 'Thank you for subscribing to Correspondence Clerk',
      body_template: `Hi {{name}},

Thank you for subscribing to Correspondence Clerk.

Your subscription is now active. Here are some tips to get more value:

- Invite your team: Settings > Team to add colleagues
- Export to Google Docs: Perfect for printing or sharing
- Set up contacts: Add contact details for quick reference

If you need any help, reply to this email or check our help documentation.

The Correspondence Clerk Team`,
      goal: 'Welcome and activate',
    },
    {
      step_number: 2,
      delay_days: 7,
      delay_hours: 0,
      subject: 'How is Correspondence Clerk working for you?',
      body_template: `Hi {{name}},

You've been using Correspondence Clerk for a week now.

How's it going? Is there anything you wish it could do differently?

Reply to this email with your feedback - we read every response and use it to improve the product.

The Correspondence Clerk Team`,
      goal: 'Collect feedback',
    },
    {
      step_number: 3,
      delay_days: 30,
      delay_hours: 0,
      subject: 'Quick question about your experience',
      body_template: `Hi {{name}},

You've been using Correspondence Clerk for a month now.

On a scale of 0-10, how likely are you to recommend Correspondence Clerk to a colleague?

Just reply with a number and any feedback you'd like to share.

Your input helps us improve.

The Correspondence Clerk Team`,
      goal: 'NPS survey',
    },
    {
      step_number: 4,
      delay_days: 45,
      delay_hours: 0,
      subject: 'Would you leave us a review?',
      body_template: `Hi {{name}},

You've been using Correspondence Clerk for over a month. If you're finding it useful, would you mind leaving us a review?

It only takes 2 minutes and helps other businesses discover us:

Leave a review: {{review_url}}

Thank you for your support.

The Correspondence Clerk Team`,
      goal: 'Generate reviews',
    },
  ],
}

/**
 * Lead Captured Sequence
 * Nurtures leads from free tools, chatbot, etc.
 */
export const LEAD_CAPTURED_SEQUENCE: EmailSequence = {
  name: 'Lead Captured',
  description: 'Nurture leads from free tools and content',
  trigger_event: 'lead_captured',
  steps: [
    {
      step_number: 1,
      delay_days: 0,
      delay_hours: 0,
      subject: 'Your free resource is ready',
      body_template: `Hi {{name}},

Thank you for using our free tool. Here's your result:

{{resource_link}}

While you're here, did you know we also offer a full correspondence management solution?

Correspondence Clerk helps businesses:
- File and organise all letters, emails, and contracts
- Find any correspondence instantly with full-text search
- Import emails directly from Outlook and Gmail
- Export professional letter files for printing

Start a free 14-day trial: {{signup_url}}

The Correspondence Clerk Team`,
      goal: 'Deliver value and introduce product',
    },
    {
      step_number: 2,
      delay_days: 3,
      delay_hours: 0,
      subject: 'The hidden cost of disorganised correspondence',
      body_template: `Hi {{name}},

Every business has correspondence chaos. Letters stuffed in folders, emails lost in inboxes, no one knows who said what and when.

The cost?
- Time wasted searching (30+ minutes per day)
- Missed follow-ups and deadlines
- Professional embarrassment when you can't find that important letter
- Legal risk from poor record-keeping

The solution is simple: one place for all correspondence, organised by business and contact, searchable instantly.

That's what Correspondence Clerk does.

See it in action: {{signup_url}}

The Correspondence Clerk Team`,
      goal: 'Highlight pain points',
    },
    {
      step_number: 3,
      delay_days: 7,
      delay_hours: 0,
      subject: 'How {{industry}} businesses manage correspondence',
      body_template: `Hi {{name}},

If you're in {{industry}}, you probably deal with correspondence from multiple sources:
- Client communications
- Regulatory letters
- Contracts and agreements
- Internal memos

Without a system, important things get lost.

Correspondence Clerk gives you:
- One searchable archive for everything
- AI-powered formatting that cleans up messy emails
- Quick filing by business and contact
- Instant export for printing or sharing

It takes 2 minutes to set up and the first 14 days are free.

Start your trial: {{signup_url}}

The Correspondence Clerk Team`,
      goal: 'Industry-specific pitch',
    },
  ],
}

/**
 * Referral Signup Sequence
 * Welcomes users who signed up via referral
 */
export const REFERRAL_SIGNUP_SEQUENCE: EmailSequence = {
  name: 'Referral Signup',
  description: 'Welcome users who signed up via referral',
  trigger_event: 'referral_signup',
  steps: [
    {
      step_number: 1,
      delay_days: 0,
      delay_hours: 0,
      subject: 'Welcome - Your friend thinks you\'ll love this',
      body_template: `Hi {{name}},

You were referred by someone who uses Correspondence Clerk. They thought you'd find it useful - and we think they're right.

Your 14-day free trial is active. When you subscribe, both you and your referrer will get 1 month free.

Get started:
1. Add your first business
2. Log some correspondence
3. See how much easier it is to find things

Need help? Reply to this email.

The Correspondence Clerk Team`,
      goal: 'Welcome referred user',
    },
  ],
}

/**
 * All sequences for seeding database
 */
export const ALL_SEQUENCES: EmailSequence[] = [
  TRIAL_STARTED_SEQUENCE,
  PURCHASE_COMPLETED_SEQUENCE,
  LEAD_CAPTURED_SEQUENCE,
  REFERRAL_SIGNUP_SEQUENCE,
]

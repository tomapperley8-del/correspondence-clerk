/**
 * Cold email generator
 * Creates human, professional outreach emails - NOT salesy
 *
 * Tone guidelines:
 * - Human story ("I built it because...")
 * - Professional but warm
 * - Short
 * - Mention time saved
 * - "Try it free"
 * - No SaaS jargon, no AI hype, no dashboards
 */

import { MarketingProspect } from './prospect-db'

export interface GeneratedEmail {
  subject: string
  body: string
  segment: string
}

type Segment = 'consultants' | 'agencies' | 'accountants' | 'default'

/**
 * Email templates by segment - approved human tone
 */
const EMAIL_TEMPLATES: Record<Segment, GeneratedEmail> = {
  consultants: {
    subject: 'something I built that might be useful',
    body: `Hi {{first_name}},

I built Correspondence Clerk because the company I worked for kept losing track of important client emails. Someone would ask "what did we agree in March?" and we'd spend half an hour searching inboxes.

It's a simple searchable archive for client correspondence. You paste in the emails that matter, they're filed by client, and you can find them later. It's saved us hours every week.

Try it free at correspondenceclerk.com

Tom`,
    segment: 'consultants',
  },

  agencies: {
    subject: 'keeping track of client emails',
    body: `Hi {{first_name}},

I built a tool called Correspondence Clerk after watching colleagues dig through inboxes every time a client referenced an old conversation.

It's a shared archive for important client emails. Everyone can search it, nothing gets lost when someone's away. What used to take 20 minutes now takes seconds.

Try it free at correspondenceclerk.com

Tom`,
    segment: 'agencies',
  },

  accountants: {
    subject: 'client correspondence',
    body: `Hi {{first_name}},

I built Correspondence Clerk because the company I worked for needed a proper record of what was said to clients and when.

It's a searchable archive for emails and letters, filed by client. Useful when you need to prove what was sent or find something from months ago. It's saved us a few hours a week in searching alone.

Try it free at correspondenceclerk.com

Tom`,
    segment: 'accountants',
  },

  default: {
    subject: 'something I built that might be useful',
    body: `Hi {{first_name}},

I built Correspondence Clerk because we kept losing track of important client emails. Someone would ask about an old conversation and we'd spend ages searching inboxes.

It's a simple searchable archive for client correspondence. You paste in the emails that matter, they're filed by client, and you can find them later. It's saved us hours every week.

Try it free at correspondenceclerk.com

Tom`,
    segment: 'default',
  },
}

/**
 * Follow-up templates - same human tone
 */
const FOLLOWUP_TEMPLATES: Record<number, { subject: string; body: string }> = {
  1: {
    subject: 'Re: {{previous_subject}}',
    body: `Hi {{first_name}},

Just following up on my note about Correspondence Clerk. No worries if it's not for you - just wanted to make sure it landed.

correspondenceclerk.com if you fancy a look.

Tom`,
  },
  2: {
    subject: 'Re: {{previous_subject}}',
    body: `Hi {{first_name}},

Last note from me on this. If keeping track of client correspondence is ever a headache, Correspondence Clerk might help. If not, all the best.

Tom`,
  },
}

/**
 * Determine segment from prospect data
 */
function getSegment(prospect: MarketingProspect): Segment {
  const industry = (prospect.industry || '').toLowerCase()
  const name = (prospect.company_name || '').toLowerCase()

  // Accountants/Bookkeepers
  if (
    industry.includes('account') ||
    industry.includes('bookkeep') ||
    industry.includes('tax') ||
    name.includes('account') ||
    name.includes('bookkeep')
  ) {
    return 'accountants'
  }

  // Agencies (design, marketing, PR, creative, branding)
  if (
    industry.includes('design') ||
    industry.includes('advertising') ||
    industry.includes('marketing') ||
    industry.includes('creative') ||
    industry.includes('branding') ||
    industry.includes('media') ||
    name.includes('agency') ||
    name.includes('studio') ||
    name.includes('creative')
  ) {
    return 'agencies'
  }

  // Consultants (management, PR, HR, IT, business)
  if (
    industry.includes('consult') ||
    industry.includes('public relations') ||
    industry.includes('pr ') ||
    industry.includes('hr ') ||
    industry.includes('human resource') ||
    industry.includes('it ') ||
    industry.includes('coach') ||
    name.includes('consult') ||
    name.includes('advisor')
  ) {
    return 'consultants'
  }

  return 'default'
}

/**
 * Generate a cold email for a prospect
 */
export function generateColdEmail(prospect: MarketingProspect): GeneratedEmail {
  const segment = getSegment(prospect)
  const template = EMAIL_TEMPLATES[segment]

  return {
    subject: template.subject,
    body: template.body,
    segment,
  }
}

/**
 * Generate a follow-up email
 */
export function generateFollowUpEmail(
  prospect: MarketingProspect,
  followUpNumber: number,
  previousSubject: string
): GeneratedEmail {
  const template = FOLLOWUP_TEMPLATES[followUpNumber] || FOLLOWUP_TEMPLATES[2]

  return {
    subject: template.subject.replace('{{previous_subject}}', previousSubject),
    body: template.body,
    segment: getSegment(prospect),
  }
}

/**
 * Personalize email with prospect data
 */
export function personalizeEmail(
  email: GeneratedEmail,
  recipientFirstName?: string
): GeneratedEmail {
  let body = email.body

  // Replace name placeholder
  body = body.replace(/{{first_name}}/g, recipientFirstName || 'there')

  return {
    ...email,
    body,
  }
}

/**
 * Extract first name from email address
 */
export function extractFirstName(email: string): string | undefined {
  const localPart = email.split('@')[0]

  // Common patterns: john.smith, john_smith, johnsmith
  const patterns = [
    /^([a-z]+)\./i,
    /^([a-z]+)_/i,
    /^([a-z]{2,10})$/i,
  ]

  for (const pattern of patterns) {
    const match = localPart.match(pattern)
    if (match) {
      const name = match[1]
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  return undefined
}

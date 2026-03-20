/**
 * Industry-specific content for programmatic SEO landing pages
 * Targeting Tier 1 ICP segments with calm, human messaging
 *
 * Tier 1:
 * - Freelance consultants (management, marketing, PR, HR, IT, digital, coaches)
 * - Small agencies (2-5 people: design, branding, PR, marketing, creative)
 * - Independent accountants/bookkeepers (1-5 people)
 *
 * Tone: Calm, human, familiar metaphors. No SaaS jargon, no AI hype.
 */

export interface IndustryData {
  slug: string
  name: string
  segment: 'consultants' | 'agencies' | 'accountants'
  tier: 1 | 2
  metaTitle: string
  metaDescription: string
  heroTitle: string
  heroSubtitle: string
  problem: string
  features: Array<{
    title: string
    description: string
  }>
  faqs: Array<{
    question: string
    answer: string
  }>
  relatedIndustries: string[]
}

export const INDUSTRIES: Record<string, IndustryData> = {
  // ============================================
  // CONSULTANTS (Tier 1)
  // ============================================

  'management-consultants': {
    slug: 'management-consultants',
    name: 'Management Consultants',
    segment: 'consultants',
    tier: 1,
    metaTitle: 'Client Correspondence for Management Consultants | Correspondence Clerk',
    metaDescription:
      'A simple place to keep copies of important client emails. Search them later when you need to check what was agreed.',
    heroTitle: 'A folder for the emails that matter',
    heroSubtitle:
      'You probably have a system already. This is just a tidier version - one searchable place for client correspondence.',
    problem:
      'When a client asks "what did we agree in March?" and you spend 20 minutes searching your inbox.',
    features: [
      {
        title: 'Filed by client',
        description: 'Each client has a folder. Paste in the emails that matter. Find them later.',
      },
      {
        title: 'Searchable',
        description: 'Find any email in seconds. Search by client, date, or what was said.',
      },
      {
        title: 'Nothing changes',
        description: 'Your words, exactly as sent. Nothing gets rewritten or summarised.',
      },
      {
        title: 'No setup',
        description: 'Works in your browser. Takes about 2 minutes to get started.',
      },
    ],
    faqs: [
      {
        question: 'How is this different from just using email folders?',
        answer:
          'It\'s not radically different - that\'s the point. It\'s just easier to search, and you can access it from anywhere. Think of it as a backup of the emails that matter.',
      },
      {
        question: 'Do I have to change how I work?',
        answer:
          'No. You keep using your email normally. When something important comes in, you paste a copy into Correspondence Clerk. That\'s it.',
      },
      {
        question: 'What does it cost?',
        answer: '£7/month. There\'s a 14-day free trial, no card needed.',
      },
      {
        question: 'Is my client data secure?',
        answer:
          'Yes. Everything is encrypted. We don\'t read your correspondence or share it with anyone.',
      },
    ],
    relatedIndustries: ['business-consultants', 'freelance-consultants', 'independent-consultants'],
  },

  'marketing-consultants': {
    slug: 'marketing-consultants',
    name: 'Marketing Consultants',
    segment: 'consultants',
    tier: 1,
    metaTitle: 'Client Correspondence for Marketing Consultants | Correspondence Clerk',
    metaDescription:
      'Keep track of what was agreed with clients. A searchable archive for important emails.',
    heroTitle: 'Remember what you agreed',
    heroSubtitle:
      'Clients change their minds. Briefs evolve. Having a record of what was actually said helps.',
    problem:
      'When a client says "that\'s not what we discussed" and you can\'t immediately find the email to prove otherwise.',
    features: [
      {
        title: 'One place for client emails',
        description: 'Important correspondence, filed by client, searchable when you need it.',
      },
      {
        title: 'Find it in seconds',
        description: 'Search by client name, date, or any word in the email.',
      },
      {
        title: 'Exact copies',
        description: 'Your words as written. Nothing paraphrased or changed.',
      },
      {
        title: 'Works alongside your inbox',
        description: 'Not a replacement. Just a backup for the emails that matter.',
      },
    ],
    faqs: [
      {
        question: 'Is this a CRM?',
        answer:
          'No. It\'s much simpler than that. No pipelines, no tasks, no automations. Just a place to keep important emails.',
      },
      {
        question: 'How do I get emails into it?',
        answer:
          'Copy and paste. Or use our bookmarklet to import directly from Gmail or Outlook with one click.',
      },
      {
        question: 'Can I try it before paying?',
        answer: 'Yes. 14-day free trial, no card required.',
      },
      {
        question: 'What if I want to cancel?',
        answer: 'Cancel anytime. No contracts, no hassle.',
      },
    ],
    relatedIndustries: ['pr-consultants', 'freelance-consultants', 'digital-consultants'],
  },

  'pr-consultants': {
    slug: 'pr-consultants',
    name: 'PR Consultants',
    segment: 'consultants',
    tier: 1,
    metaTitle: 'Client Correspondence for PR Consultants | Correspondence Clerk',
    metaDescription:
      'Track what was said to clients and when. A simple searchable archive for PR professionals.',
    heroTitle: 'When clients need reminding',
    heroSubtitle:
      'Approvals, feedback, sign-offs - having a clear record makes conversations easier.',
    problem:
      'When a client disputes what was approved and you need to find the email thread from three months ago.',
    features: [
      {
        title: 'Client folders',
        description: 'Each client gets a folder. Approvals, feedback, sign-offs - all in one place.',
      },
      {
        title: 'Quick search',
        description: 'Find any correspondence in seconds.',
      },
      {
        title: 'Nothing rewritten',
        description: 'Exact copies of what was sent and received.',
      },
      {
        title: 'Browser-based',
        description: 'Access from anywhere. Nothing to install.',
      },
    ],
    faqs: [
      {
        question: 'Do I need to import all my old emails?',
        answer:
          'No. Most people just start fresh and add important emails as they come in. You can add old ones later if you need to.',
      },
      {
        question: 'Can I share access with a colleague?',
        answer:
          'Yes. You can invite team members so everyone can search the same archive.',
      },
      {
        question: 'How much does it cost?',
        answer: '£7/month per person. Free 14-day trial.',
      },
      {
        question: 'Is there a mobile app?',
        answer:
          'It works in your mobile browser. No app needed.',
      },
    ],
    relatedIndustries: ['marketing-consultants', 'communications-consultants', 'freelance-consultants'],
  },

  'hr-consultants': {
    slug: 'hr-consultants',
    name: 'HR Consultants',
    segment: 'consultants',
    tier: 1,
    metaTitle: 'Client Correspondence for HR Consultants | Correspondence Clerk',
    metaDescription:
      'Keep a clear record of client communications. Important when advice needs to be documented.',
    heroTitle: 'Document what was advised',
    heroSubtitle:
      'HR advice needs clear records. A searchable archive of client correspondence helps.',
    problem:
      'When you need to check exactly what advice was given, and when.',
    features: [
      {
        title: 'Organised by client',
        description: 'All correspondence for each client in one searchable place.',
      },
      {
        title: 'Exact wording preserved',
        description: 'Nothing summarised or changed. Your words as written.',
      },
      {
        title: 'Easy to search',
        description: 'Find specific advice or discussions quickly.',
      },
      {
        title: 'Secure',
        description: 'Encrypted and private. Only you can access your correspondence.',
      },
    ],
    faqs: [
      {
        question: 'Is this suitable for sensitive HR matters?',
        answer:
          'Yes. All data is encrypted. We don\'t have access to your correspondence.',
      },
      {
        question: 'Can I export correspondence if needed?',
        answer:
          'Yes. You can export to Google Docs for printing or sharing.',
      },
      {
        question: 'How does pricing work?',
        answer: '£7/month. Cancel anytime.',
      },
      {
        question: 'Is there a contract?',
        answer: 'No. Month to month, cancel whenever.',
      },
    ],
    relatedIndustries: ['management-consultants', 'business-consultants', 'freelance-consultants'],
  },

  'it-consultants': {
    slug: 'it-consultants',
    name: 'IT Consultants',
    segment: 'consultants',
    tier: 1,
    metaTitle: 'Client Correspondence for IT Consultants | Correspondence Clerk',
    metaDescription:
      'Track project discussions and client agreements. A searchable archive for IT professionals.',
    heroTitle: 'Track what was scoped',
    heroSubtitle:
      'Scope creep happens. Having a record of what was originally agreed helps.',
    problem:
      'When a client insists a feature was included and you need to find the original requirements email.',
    features: [
      {
        title: 'Project correspondence',
        description: 'Requirements, changes, approvals - filed by client or project.',
      },
      {
        title: 'Search everything',
        description: 'Find specific discussions or agreements instantly.',
      },
      {
        title: 'Unchanged copies',
        description: 'Exactly what was said, preserved as written.',
      },
      {
        title: 'Simple to use',
        description: 'No complex setup. Works in your browser.',
      },
    ],
    faqs: [
      {
        question: 'Can I organise by project instead of client?',
        answer:
          'Yes. You can create a folder for each project, or each client - whatever works for you.',
      },
      {
        question: 'Does it integrate with project management tools?',
        answer:
          'No, and intentionally so. It\'s a simple archive, not another tool to manage.',
      },
      {
        question: 'What\'s the pricing?',
        answer: '£7/month. Try free for 14 days.',
      },
      {
        question: 'Can multiple team members use it?',
        answer: 'Yes. Invite colleagues to share the same archive.',
      },
    ],
    relatedIndustries: ['digital-consultants', 'freelance-consultants', 'tech-consultants'],
  },

  'business-coaches': {
    slug: 'business-coaches',
    name: 'Business Coaches',
    segment: 'consultants',
    tier: 1,
    metaTitle: 'Client Correspondence for Business Coaches | Correspondence Clerk',
    metaDescription:
      'Keep a record of client conversations and agreements. Simple and searchable.',
    heroTitle: 'Remember every client conversation',
    heroSubtitle:
      'Coaching involves ongoing dialogue. A searchable record helps you pick up where you left off.',
    problem:
      'When you need to recall what a client committed to, or what advice you gave previously.',
    features: [
      {
        title: 'Client history',
        description: 'All correspondence with each client, in one place.',
      },
      {
        title: 'Quick to search',
        description: 'Find past discussions instantly.',
      },
      {
        title: 'Nothing altered',
        description: 'Exact copies of emails and messages.',
      },
      {
        title: 'Minimal admin',
        description: 'Paste and file. Takes seconds.',
      },
    ],
    faqs: [
      {
        question: 'Is this like a CRM?',
        answer:
          'No. Much simpler. No pipelines or sales features. Just a place to keep important correspondence.',
      },
      {
        question: 'Can I access it on my phone?',
        answer: 'Yes. Works in any browser.',
      },
      {
        question: 'How much is it?',
        answer: '£7/month after a 14-day free trial.',
      },
      {
        question: 'What if I stop using it?',
        answer: 'You can export your data anytime. Cancel whenever you like.',
      },
    ],
    relatedIndustries: ['management-consultants', 'executive-coaches', 'freelance-consultants'],
  },

  'freelance-consultants': {
    slug: 'freelance-consultants',
    name: 'Freelance Consultants',
    segment: 'consultants',
    tier: 1,
    metaTitle: 'Client Correspondence for Freelance Consultants | Correspondence Clerk',
    metaDescription:
      'A simple archive for important client emails. Find what was agreed, when you need it.',
    heroTitle: 'Your client correspondence, organised',
    heroSubtitle:
      'Freelancing means juggling multiple clients. Keep track of what was said to whom.',
    problem:
      'When a client references an old email and you spend 20 minutes failing to find it.',
    features: [
      {
        title: 'One place for everything',
        description: 'Important client emails, filed and searchable.',
      },
      {
        title: 'Find it fast',
        description: 'Search by client, date, or content.',
      },
      {
        title: 'No rewrites',
        description: 'Your exact words, preserved.',
      },
      {
        title: 'Zero setup',
        description: 'Start using it in 2 minutes.',
      },
    ],
    faqs: [
      {
        question: 'I already use email folders. Why would I need this?',
        answer:
          'You might not. But if you find yourself spending time searching, or worrying about losing something important, this makes it easier.',
      },
      {
        question: 'Does it sync with my email?',
        answer:
          'No automatic sync. You choose what to save. Most people prefer it that way - keeps it clean.',
      },
      {
        question: 'What does it cost?',
        answer: '£7/month. Free trial, no card required.',
      },
      {
        question: 'Can I cancel anytime?',
        answer: 'Yes. No contracts.',
      },
    ],
    relatedIndustries: ['management-consultants', 'marketing-consultants', 'it-consultants'],
  },

  // ============================================
  // AGENCIES (Tier 1)
  // ============================================

  'design-agencies': {
    slug: 'design-agencies',
    name: 'Design Agencies',
    segment: 'agencies',
    tier: 1,
    metaTitle: 'Client Correspondence for Design Agencies | Correspondence Clerk',
    metaDescription:
      'A shared archive for client emails. Everyone can search it, nothing gets lost.',
    heroTitle: 'When someone asks "who agreed to that?"',
    heroSubtitle:
      'Client feedback changes. Approvals get buried in email chains. A shared archive helps.',
    problem:
      'When a client disputes feedback they gave, or a colleague is away and you need to find what was discussed.',
    features: [
      {
        title: 'Shared by the team',
        description: 'Everyone can search the same client correspondence archive.',
      },
      {
        title: 'Nothing gets lost',
        description: 'When someone\'s away, the context is still there.',
      },
      {
        title: 'Search instantly',
        description: 'Find any client discussion in seconds.',
      },
      {
        title: 'Simple to use',
        description: 'Paste important emails in. That\'s basically it.',
      },
    ],
    faqs: [
      {
        question: 'How many people can use it?',
        answer: 'As many as you need. £7/month per person.',
      },
      {
        question: 'Can we organise by project?',
        answer: 'Yes. Create folders for projects, clients, or however you prefer.',
      },
      {
        question: 'Does it replace our project management tool?',
        answer:
          'No. It\'s just for correspondence. Think of it as a shared filing cabinet for client emails.',
      },
      {
        question: 'Is there a free trial?',
        answer: 'Yes. 14 days, no card needed.',
      },
    ],
    relatedIndustries: ['branding-agencies', 'creative-agencies', 'marketing-agencies'],
  },

  'branding-agencies': {
    slug: 'branding-agencies',
    name: 'Branding Agencies',
    segment: 'agencies',
    tier: 1,
    metaTitle: 'Client Correspondence for Branding Agencies | Correspondence Clerk',
    metaDescription:
      'Track client feedback and approvals. A shared, searchable archive for your team.',
    heroTitle: 'Track approvals and feedback',
    heroSubtitle:
      'Branding projects involve lots of back-and-forth. Keep a record everyone can access.',
    problem:
      'When a client says "I never approved that" and no one can find the original sign-off email.',
    features: [
      {
        title: 'Team access',
        description: 'Everyone sees the same client correspondence.',
      },
      {
        title: 'Searchable history',
        description: 'Find approvals, feedback, and discussions instantly.',
      },
      {
        title: 'Exact copies',
        description: 'What was said, unchanged.',
      },
      {
        title: 'Easy handovers',
        description: 'New team members can see the full history.',
      },
    ],
    faqs: [
      {
        question: 'Can clients access it?',
        answer: 'No. It\'s for your team only. You can export and share specific items if needed.',
      },
      {
        question: 'How do we get started?',
        answer: 'Sign up, invite your team, start pasting in important emails. Takes a few minutes.',
      },
      {
        question: 'What\'s the cost?',
        answer: '£7/month per person. Free 14-day trial.',
      },
      {
        question: 'Can we cancel if it doesn\'t work for us?',
        answer: 'Yes. Cancel anytime, no penalties.',
      },
    ],
    relatedIndustries: ['design-agencies', 'creative-agencies', 'marketing-agencies'],
  },

  'pr-agencies': {
    slug: 'pr-agencies',
    name: 'PR Agencies',
    segment: 'agencies',
    tier: 1,
    metaTitle: 'Client Correspondence for PR Agencies | Correspondence Clerk',
    metaDescription:
      'Keep track of client communications across your team. Searchable and shared.',
    heroTitle: 'Client communications, accessible to all',
    heroSubtitle:
      'PR moves fast. When someone\'s out, the team needs to access client context.',
    problem:
      'When an account manager is sick and no one knows what was last discussed with the client.',
    features: [
      {
        title: 'Shared archive',
        description: 'The whole team can search client correspondence.',
      },
      {
        title: 'Find context fast',
        description: 'Search by client, journalist, or topic.',
      },
      {
        title: 'No lost threads',
        description: 'Important discussions don\'t disappear into individual inboxes.',
      },
      {
        title: 'Works alongside email',
        description: 'Not a replacement. A backup.',
      },
    ],
    faqs: [
      {
        question: 'Does it integrate with our email?',
        answer: 'You can import from Outlook or Gmail with one click. But no automatic syncing.',
      },
      {
        question: 'Can we restrict who sees what?',
        answer: 'Currently everyone in your team sees everything. We may add permissions later.',
      },
      {
        question: 'How much does it cost?',
        answer: '£7/month per person.',
      },
      {
        question: 'Is there a discount for larger teams?',
        answer: 'Get in touch and we can discuss.',
      },
    ],
    relatedIndustries: ['marketing-agencies', 'communications-agencies', 'creative-agencies'],
  },

  'marketing-agencies': {
    slug: 'marketing-agencies',
    name: 'Marketing Agencies',
    segment: 'agencies',
    tier: 1,
    metaTitle: 'Client Correspondence for Marketing Agencies | Correspondence Clerk',
    metaDescription:
      'A shared archive for client emails. Find what was agreed, even when colleagues are away.',
    heroTitle: 'Stop digging through inboxes',
    heroSubtitle:
      'When a client quotes an old email you can\'t find, or a colleague is away and you need context.',
    problem:
      'When piecing together what was discussed takes longer than the actual meeting.',
    features: [
      {
        title: 'Shared by the team',
        description: 'Everyone can search client correspondence.',
      },
      {
        title: 'Instant search',
        description: 'Find any email in seconds.',
      },
      {
        title: 'Clear record',
        description: 'What was said, when, to whom.',
      },
      {
        title: 'Simple',
        description: 'No complex setup or training needed.',
      },
    ],
    faqs: [
      {
        question: 'Is this a CRM?',
        answer: 'No. No pipelines, no automation, no sales features. Just correspondence.',
      },
      {
        question: 'Can we try it first?',
        answer: 'Yes. 14-day free trial, no card required.',
      },
      {
        question: 'What\'s the pricing?',
        answer: '£7/month per person.',
      },
      {
        question: 'Can we export our data?',
        answer: 'Yes. Export to Google Docs anytime.',
      },
    ],
    relatedIndustries: ['pr-agencies', 'design-agencies', 'creative-agencies'],
  },

  'creative-agencies': {
    slug: 'creative-agencies',
    name: 'Creative Agencies',
    segment: 'agencies',
    tier: 1,
    metaTitle: 'Client Correspondence for Creative Agencies | Correspondence Clerk',
    metaDescription:
      'Track client feedback and discussions. A shared archive your whole team can search.',
    heroTitle: 'Client feedback in one place',
    heroSubtitle:
      'Creative work involves endless rounds of feedback. Keep track of what was said.',
    problem:
      'When you need to check what round of feedback you\'re on, or what the client actually approved.',
    features: [
      {
        title: 'Team-wide access',
        description: 'Everyone can find client discussions.',
      },
      {
        title: 'Searchable feedback',
        description: 'Find specific comments or approvals quickly.',
      },
      {
        title: 'Nothing changed',
        description: 'Exact client words, preserved.',
      },
      {
        title: 'Easy to use',
        description: 'Paste important emails in. Search later.',
      },
    ],
    faqs: [
      {
        question: 'How is this different from just sharing an email folder?',
        answer: 'It\'s searchable across all clients, accessible to everyone, and you choose what goes in.',
      },
      {
        question: 'Do we need training?',
        answer: 'No. If you can use email, you can use this.',
      },
      {
        question: 'Cost?',
        answer: '£7/month per person. Free trial available.',
      },
      {
        question: 'Any contracts?',
        answer: 'No. Month to month.',
      },
    ],
    relatedIndustries: ['design-agencies', 'branding-agencies', 'marketing-agencies'],
  },

  // ============================================
  // ACCOUNTANTS & BOOKKEEPERS (Tier 1)
  // ============================================

  accountants: {
    slug: 'accountants',
    name: 'Accountants',
    segment: 'accountants',
    tier: 1,
    metaTitle: 'Client Correspondence for Accountants | Correspondence Clerk',
    metaDescription:
      'A searchable archive for client emails and letters. Useful when HMRC asks questions.',
    heroTitle: 'When you need to prove what was sent',
    heroSubtitle:
      'HMRC queries, client disputes, handovers - a clear correspondence record helps.',
    problem:
      'When a client claims they sent something they didn\'t, or HMRC wants evidence of what was communicated.',
    features: [
      {
        title: 'Filed by client',
        description: 'Each client\'s correspondence in one searchable place.',
      },
      {
        title: 'Exact wording',
        description: 'Nothing summarised. Your words as written.',
      },
      {
        title: 'Quick search',
        description: 'Find specific letters or emails in seconds.',
      },
      {
        title: 'Familiar concept',
        description: 'Like a client file, but searchable and backed up.',
      },
    ],
    faqs: [
      {
        question: 'Is this like practice management software?',
        answer: 'No. Much simpler. It\'s just for correspondence, not workflow or billing.',
      },
      {
        question: 'Can I keep HMRC correspondence here too?',
        answer: 'Yes. Create a folder for HMRC, or file their letters against individual clients.',
      },
      {
        question: 'What does it cost?',
        answer: '£7/month. Free 14-day trial.',
      },
      {
        question: 'Is client data secure?',
        answer: 'Yes. Encrypted and private. We don\'t access your correspondence.',
      },
    ],
    relatedIndustries: ['bookkeepers', 'tax-advisors', 'small-accountancy-practices'],
  },

  bookkeepers: {
    slug: 'bookkeepers',
    name: 'Bookkeepers',
    segment: 'accountants',
    tier: 1,
    metaTitle: 'Client Correspondence for Bookkeepers | Correspondence Clerk',
    metaDescription:
      'Keep a record of what clients sent and when. Simple, searchable, secure.',
    heroTitle: 'Did they send it or didn\'t they?',
    heroSubtitle:
      'Clients sometimes forget what they did or didn\'t provide. A clear record helps.',
    problem:
      'When a client insists they sent information that you never received.',
    features: [
      {
        title: 'Client folders',
        description: 'Important correspondence, organised by client.',
      },
      {
        title: 'Searchable',
        description: 'Find what you need quickly.',
      },
      {
        title: 'Nothing altered',
        description: 'Exact copies of emails and letters.',
      },
      {
        title: 'Simple',
        description: 'No complexity. Just paste and file.',
      },
    ],
    faqs: [
      {
        question: 'Is this affordable for a small practice?',
        answer: 'Yes. £7/month. Most bookkeepers find it saves more time than it costs.',
      },
      {
        question: 'Can I access it from home?',
        answer: 'Yes. Browser-based, works anywhere.',
      },
      {
        question: 'Is there a free trial?',
        answer: 'Yes. 14 days, no card needed.',
      },
      {
        question: 'What if I need help getting started?',
        answer: 'Email us. We\'re happy to help.',
      },
    ],
    relatedIndustries: ['accountants', 'payroll-services', 'tax-advisors'],
  },

  'tax-advisors': {
    slug: 'tax-advisors',
    name: 'Tax Advisors',
    segment: 'accountants',
    tier: 1,
    metaTitle: 'Client Correspondence for Tax Advisors | Correspondence Clerk',
    metaDescription:
      'Document client communications clearly. Useful for queries and compliance.',
    heroTitle: 'Clear records of what was advised',
    heroSubtitle:
      'Tax advice needs documentation. A searchable archive of correspondence helps.',
    problem:
      'When HMRC queries something and you need to show what advice was given.',
    features: [
      {
        title: 'By client',
        description: 'All correspondence for each client, in one place.',
      },
      {
        title: 'Exact copies',
        description: 'Your advice as written, unchanged.',
      },
      {
        title: 'Find it fast',
        description: 'Search by client, date, or content.',
      },
      {
        title: 'Secure',
        description: 'Encrypted and private.',
      },
    ],
    faqs: [
      {
        question: 'Is this compliant with professional requirements?',
        answer: 'It helps you keep records. Check your professional body for specific requirements.',
      },
      {
        question: 'Can I export records if needed?',
        answer: 'Yes. Export to Google Docs for printing or sharing.',
      },
      {
        question: 'Pricing?',
        answer: '£7/month per person.',
      },
      {
        question: 'Contracts?',
        answer: 'No. Cancel anytime.',
      },
    ],
    relatedIndustries: ['accountants', 'bookkeepers', 'financial-advisors'],
  },

  // ============================================
  // TIER 2 (Property - for later)
  // ============================================

  'letting-agents': {
    slug: 'letting-agents',
    name: 'Letting Agents',
    segment: 'accountants', // Using accountants segment for similar tone
    tier: 2,
    metaTitle: 'Correspondence for Letting Agents | Correspondence Clerk',
    metaDescription:
      'Track tenant and landlord correspondence. Searchable records for property management.',
    heroTitle: 'Tenant said, landlord said',
    heroSubtitle:
      'Property management means lots of correspondence. Keep track of who said what.',
    problem:
      'When there\'s a dispute and you need to find what was communicated months ago.',
    features: [
      {
        title: 'By property or contact',
        description: 'Organise however works for you.',
      },
      {
        title: 'Searchable',
        description: 'Find specific correspondence quickly.',
      },
      {
        title: 'Team access',
        description: 'Everyone can search the archive.',
      },
      {
        title: 'Simple',
        description: 'No training needed.',
      },
    ],
    faqs: [
      {
        question: 'Can I organise by property?',
        answer: 'Yes. Create a folder for each property, or by landlord - your choice.',
      },
      {
        question: 'Does this help with disputes?',
        answer: 'Having clear records of what was communicated can be valuable.',
      },
      {
        question: 'Cost?',
        answer: '£7/month per person.',
      },
      {
        question: 'Free trial?',
        answer: 'Yes. 14 days.',
      },
    ],
    relatedIndustries: ['property-managers', 'estate-agents'],
  },

  'property-managers': {
    slug: 'property-managers',
    name: 'Property Managers',
    segment: 'accountants',
    tier: 2,
    metaTitle: 'Correspondence for Property Managers | Correspondence Clerk',
    metaDescription:
      'Track correspondence with tenants, landlords, and contractors. Searchable records.',
    heroTitle: 'Property correspondence, organised',
    heroSubtitle:
      'Multiple properties, multiple contacts. Keep track of communications.',
    problem:
      'When you need to find what was said about a specific property or issue.',
    features: [
      {
        title: 'Organised by property',
        description: 'Or by landlord, tenant, contractor - however you prefer.',
      },
      {
        title: 'Quick search',
        description: 'Find any correspondence in seconds.',
      },
      {
        title: 'Shared access',
        description: 'Team members can search the same archive.',
      },
      {
        title: 'Simple to use',
        description: 'Paste in what matters. Search later.',
      },
    ],
    faqs: [
      {
        question: 'Can multiple staff access it?',
        answer: 'Yes. Invite team members as needed.',
      },
      {
        question: 'Is it secure?',
        answer: 'Yes. All data encrypted.',
      },
      {
        question: 'What does it cost?',
        answer: '£7/month per person.',
      },
      {
        question: 'Can we try it first?',
        answer: 'Yes. 14-day free trial.',
      },
    ],
    relatedIndustries: ['letting-agents', 'estate-agents'],
  },
}

/**
 * Get all industry slugs for static generation
 */
export function getAllIndustrySlugs(): string[] {
  return Object.keys(INDUSTRIES)
}

/**
 * Get industry data by slug
 */
export function getIndustryBySlug(slug: string): IndustryData | null {
  return INDUSTRIES[slug] || null
}

/**
 * Get all Tier 1 industries
 */
export function getTier1Industries(): IndustryData[] {
  return Object.values(INDUSTRIES).filter((i) => i.tier === 1)
}

/**
 * Get industries by segment
 */
export function getIndustriesBySegment(
  segment: 'consultants' | 'agencies' | 'accountants'
): IndustryData[] {
  return Object.values(INDUSTRIES).filter((i) => i.segment === segment)
}

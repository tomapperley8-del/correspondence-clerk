import Link from 'next/link'

export const metadata = {
  title: 'Features - Correspondence Clerk',
  description: 'AI-powered correspondence management: daily briefing assistant, one-click email import, automatic filing, and powerful search — for small businesses and VAs.',
}

const features = [
  {
    title: 'Daily Briefing',
    description:
      'Ask "what do I need to do today?" and get a prioritised breakdown of unreplied emails, expiring contracts, and stale follow-ups — with context from your actual correspondence history, not just counts.',
    details: [
      'Understands your full correspondence history',
      'Surfaces unreplied emails and cold follow-ups',
      'Flags contracts expiring soon',
      'Ask anything: "who haven\'t I spoken to in 3 months?"',
    ],
  },
  {
    title: 'AI formatting',
    description:
      'Paste a messy email thread and get clean, professionally formatted correspondence. Every word preserved exactly as written — no rewrites, no summaries, just better structure.',
    details: [
      'Detects email threads and formats them chronologically',
      'Preserves original wording exactly',
      'Handles any email client format',
      'Falls back gracefully if AI is unavailable',
    ],
  },
  {
    title: 'One-click email import',
    description:
      'A browser bookmarklet imports emails from Outlook or Gmail in a single click. Or connect your inbox and bulk-import months of past correspondence at once.',
    details: [
      'Works with Outlook Web and Gmail',
      'Extracts sender, recipient, date, and subject automatically',
      'Bulk import scans your inbox for review before saving',
      'Data goes directly to your account — nothing stored in transit',
    ],
  },
  {
    title: 'Organised correspondence files',
    description:
      'Every piece of correspondence is filed by business and contact. Recent items at hand, older items archived but fully searchable.',
    details: [
      'Two-section view: Recent and Archive',
      'File by business and specific contact',
      'Track CC and BCC recipients',
      'Pin important entries',
    ],
  },
  {
    title: 'Professional exports',
    description:
      'Generate print-ready documents whenever you need them. Export to PDF or Google Docs with consistent, professional formatting.',
    details: [
      'PDF export for printing and sharing',
      'Google Docs integration',
      'Consistent layout across all exports',
    ],
  },
  {
    title: 'Full-text search',
    description:
      'Find any conversation in seconds. Search by business name, contact, subject, or content across your entire history.',
    details: [
      'Search across all businesses and contacts',
      'Filter by date range',
      'Business name prioritised in results',
    ],
  },
  {
    title: 'Team access',
    description:
      'Invite your team to manage correspondence together. Role-based permissions, shared view, audit trail.',
    details: [
      'Invite team members (Pro and Enterprise)',
      'Admin and Member roles',
      'Everyone sees the same organised view',
    ],
  },
  {
    title: 'Duplicate detection',
    description:
      'Automatically flags when the same correspondence has been entered twice. Review and dismiss with one click.',
    details: [
      'Automatic duplicate detection on save',
      'Side-by-side comparison',
      'One-click dismiss',
    ],
  },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
      {/* Header */}
      <header style={{ backgroundColor: '#FAFAF8', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <Link
            href="/"
            className="font-bold text-xl"
            style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B' }}
          >
            Correspondence Clerk
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/login" className="text-sm font-medium" style={{ color: '#475569' }}>
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2"
              style={{ backgroundColor: '#2C4A6E', color: '#fff' }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20" style={{ backgroundColor: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="container mx-auto px-6 max-w-2xl">
          <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: '#7C9A5E' }}>
            Features
          </p>
          <h1
            className="text-4xl md:text-5xl font-bold mb-5 leading-tight"
            style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B', letterSpacing: '-0.02em' }}
          >
            An AI assistant for your business correspondence
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: '#475569' }}>
            Start every day knowing exactly who to contact, what to follow up on,
            and which contracts need attention — all from one organised place.
          </p>
        </div>
      </section>

      {/* Features */}
      <main className="container mx-auto px-6 py-20">
        <div className="space-y-12">
          {features.map((feature, index) => (
            <div
              key={index}
              className="grid md:grid-cols-5 gap-8 py-10"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
            >
              {/* Description — wider col */}
              <div className="md:col-span-3">
                <h2
                  className="text-xl font-bold mb-3"
                  style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B' }}
                >
                  {feature.title}
                </h2>
                <p className="text-base leading-relaxed" style={{ color: '#475569' }}>
                  {feature.description}
                </p>
              </div>

              {/* Detail bullets */}
              <div className="md:col-span-2">
                <ul className="space-y-2.5">
                  {feature.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        className="mt-2 shrink-0 w-1 h-1 rounded-full block"
                        style={{ backgroundColor: '#7C9A5E' }}
                      />
                      <span className="text-sm leading-relaxed" style={{ color: '#64748b' }}>
                        {detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-20 pt-10" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <h2
            className="text-2xl font-bold mb-3"
            style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B' }}
          >
            Start knowing what needs your attention
          </h2>
          <p className="text-base mb-6" style={{ color: '#64748b' }}>
            14-day free trial. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-block text-sm font-semibold px-6 py-3"
            style={{ backgroundColor: '#2C4A6E', color: '#fff' }}
          >
            Start free trial
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="container mx-auto px-6 flex flex-wrap justify-between items-center gap-4">
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            &copy; {new Date().getFullYear()} Correspondence Clerk
          </p>
          <div className="flex gap-6 text-xs" style={{ color: '#94a3b8' }}>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

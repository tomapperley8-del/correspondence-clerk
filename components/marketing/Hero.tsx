import Link from 'next/link'

export function Hero() {
  return (
    <section style={{ backgroundColor: 'var(--main-bg)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="container mx-auto px-6 py-20 md:py-28">
        <div className="grid md:grid-cols-2 gap-16 items-start">

          {/* Left: headline + CTAs */}
          <div className="pt-4">
            <p className="text-xs font-semibold tracking-widest uppercase mb-6" style={{ color: 'var(--link-hover)' }}>
              AI-powered correspondence management
            </p>
            <h1
              className="text-5xl md:text-6xl font-bold leading-tight mb-7"
              style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--header-bg)', letterSpacing: '-0.02em' }}
            >
              Know exactly what needs your attention today
            </h1>
            <p className="text-lg mb-10 leading-relaxed" style={{ color: '#475569', maxWidth: '44ch' }}>
              An AI assistant that reads your business correspondence and tells you
              who to reply to, which contracts are expiring, and which follow-ups
              have gone cold — every morning in seconds.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="text-sm font-semibold px-7 py-3.5 transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--link-blue)', color: '#fff' }}
              >
                Start free 14-day trial
              </Link>
              <Link
                href="/features"
                className="text-sm font-semibold px-7 py-3.5 transition-colors"
                style={{ border: '1px solid rgba(0,0,0,0.15)', color: 'var(--header-bg)', backgroundColor: 'transparent' }}
              >
                See how it works
              </Link>
            </div>
            <p className="mt-4 text-xs" style={{ color: '#94a3b8' }}>No credit card required.</p>
          </div>

          {/* Right: assistant output mockup */}
          <div
            className="rounded-sm"
            style={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}
          >
            {/* Window chrome */}
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.07)', backgroundColor: '#F8F9FA' }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#e2e8f0' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#e2e8f0' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#e2e8f0' }} />
              <span className="ml-3 text-xs" style={{ color: '#94a3b8' }}>Insights</span>
            </div>

            {/* Chat input */}
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', backgroundColor: 'var(--main-bg)' }}>
              <p className="text-sm" style={{ color: '#64748b' }}>
                <span className="font-medium" style={{ color: 'var(--header-bg)' }}>You:</span>{' '}
                What do I need to do today?
              </p>
            </div>

            {/* Assistant response */}
            <div className="px-5 py-5">
              <p className="text-sm font-medium mb-4" style={{ color: 'var(--header-bg)' }}>
                Here&apos;s what needs your attention:
              </p>
              <div className="space-y-4">
                {[
                  {
                    label: 'Overdue reply',
                    business: 'The Richmond Kitchen',
                    detail: 'No reply to your catering proposal sent 6 days ago. Last contact: Mark Davies.',
                    urgent: true,
                  },
                  {
                    label: 'Contract expiring',
                    business: 'Hartley & Sons Solicitors',
                    detail: 'Contract renewal due in 9 days. No renewal discussion on file.',
                    urgent: true,
                  },
                  {
                    label: 'Unreplied emails',
                    business: '3 other contacts',
                    detail: 'Sent emails in the last 48 hours with no reply recorded.',
                    urgent: false,
                  },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div
                      className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: item.urgent ? 'var(--link-blue)' : 'var(--link-hover)' }}
                    />
                    <div>
                      <p className="text-xs font-semibold mb-0.5" style={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {item.label}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--header-bg)' }}>
                        <span className="font-medium">{item.business}</span>
                        {' '}— {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

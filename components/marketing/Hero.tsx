import Link from 'next/link'

export function Hero() {
  return (
    <section style={{ backgroundColor: '#FAFAF8', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="container mx-auto px-6 py-24 md:py-32">
        <div className="max-w-2xl">
          <h1
            className="text-4xl md:text-5xl font-bold leading-tight mb-6"
            style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B' }}
          >
            Know exactly what needs your attention today
          </h1>
          <p className="text-lg mb-8 leading-relaxed" style={{ color: '#475569' }}>
            An AI assistant that reads your business correspondence and tells you
            who to reply to, which contracts are expiring, and which follow-ups
            have gone cold — every morning in seconds.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="text-sm font-medium px-6 py-3"
              style={{ backgroundColor: '#2C4A6E', color: '#fff' }}
            >
              Start free 14-day trial
            </Link>
            <Link
              href="/features"
              className="text-sm font-medium px-6 py-3"
              style={{ border: '1px solid rgba(0,0,0,0.2)', color: '#1E293B', backgroundColor: '#fff' }}
            >
              See how it works
            </Link>
          </div>
          <p className="mt-4 text-sm" style={{ color: '#94a3b8' }}>No credit card required.</p>
        </div>

        {/* Assistant output mockup */}
        <div
          className="mt-16 max-w-xl"
          style={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
        >
          <div
            className="px-5 py-3 text-xs font-medium tracking-wide"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', color: '#94a3b8', backgroundColor: '#FAFAF8' }}
          >
            Daily Briefing — example
          </div>
          <div className="px-5 py-5 space-y-4">
            <p className="text-sm font-medium" style={{ color: '#1E293B' }}>
              Here&apos;s what needs your attention today:
            </p>
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="mt-0.5 text-xs font-semibold shrink-0 w-5 text-right" style={{ color: '#7C9A5E' }}>1.</span>
                <p className="text-sm" style={{ color: '#334155' }}>
                  <span className="font-medium">Acme Ltd</span> — your proposal sent 8 days ago has had no reply.
                  Last contact: Sarah Chen.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="mt-0.5 text-xs font-semibold shrink-0 w-5 text-right" style={{ color: '#7C9A5E' }}>2.</span>
                <p className="text-sm" style={{ color: '#334155' }}>
                  <span className="font-medium">Greenfield Partners</span> — contract renews in 12 days.
                  No renewal discussion on file.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="mt-0.5 text-xs font-semibold shrink-0 w-5 text-right" style={{ color: '#7C9A5E' }}>3.</span>
                <p className="text-sm" style={{ color: '#334155' }}>
                  3 other contacts sent emails in the last 48 hours with no reply on file.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

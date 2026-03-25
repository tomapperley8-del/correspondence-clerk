import Link from 'next/link'

export function MarketingFooter() {
  return (
    <footer style={{ backgroundColor: 'var(--header-bg)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:justify-between gap-8">
          <div>
            <p className="font-semibold mb-1" style={{ fontFamily: 'Lora, Georgia, serif', color: '#fff' }}>
              Correspondence Clerk
            </p>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Know what needs your attention, every day.
            </p>
          </div>

          <div className="flex gap-12 text-sm">
            <div className="space-y-2">
              <Link href="/features" style={{ color: '#94a3b8' }} className="block hover:text-white transition-colors">Features</Link>
              <Link href="/pricing" style={{ color: '#94a3b8' }} className="block hover:text-white transition-colors">Pricing</Link>
            </div>
            <div className="space-y-2">
              <Link href="/terms" style={{ color: '#94a3b8' }} className="block hover:text-white transition-colors">Terms</Link>
              <Link href="/privacy" style={{ color: '#94a3b8' }} className="block hover:text-white transition-colors">Privacy</Link>
              <a href="mailto:support@correspondenceclerk.com" style={{ color: '#94a3b8' }} className="block hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569' }}>
          &copy; {new Date().getFullYear()} Correspondence Clerk
        </div>
      </div>
    </footer>
  )
}

import Link from 'next/link'

export function MarketingNav() {
  return (
    <header style={{ backgroundColor: '#FAFAF8', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="font-serif text-xl font-bold" style={{ color: '#1E293B', fontFamily: 'Lora, Georgia, serif' }}>
          Correspondence Clerk
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/features" className="text-sm font-medium" style={{ color: '#475569' }}>
            Features
          </Link>
          <Link href="/pricing" className="text-sm font-medium" style={{ color: '#475569' }}>
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-5">
          <Link href="/login" className="text-sm font-medium" style={{ color: '#475569' }}>
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium px-4 py-2"
            style={{ backgroundColor: '#2C4A6E', color: '#fff' }}
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  )
}

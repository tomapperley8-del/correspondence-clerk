import Link from 'next/link'

export function CTASection() {
  return (
    <section className="py-24" style={{ backgroundColor: '#1E293B' }}>
      <div className="container mx-auto px-6 max-w-2xl">
        <h2
          className="text-3xl font-bold mb-4"
          style={{ fontFamily: 'Lora, Georgia, serif', color: '#fff' }}
        >
          Start knowing what needs your attention
        </h2>
        <p className="text-base mb-8 leading-relaxed" style={{ color: '#94a3b8' }}>
          14-day free trial. No credit card required.
        </p>
        <Link
          href="/signup"
          className="inline-block text-sm font-medium px-6 py-3"
          style={{ backgroundColor: '#7C9A5E', color: '#fff' }}
        >
          Start free trial
        </Link>
      </div>
    </section>
  )
}

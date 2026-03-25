export function SocialProof() {
  return (
    <section style={{ backgroundColor: 'var(--header-bg)' }}>
      {/* Trust bar */}
      <div className="container mx-auto px-6 py-14">
        <div className="grid md:grid-cols-3 gap-8 md:gap-4 items-center text-center">
          <div>
            <p
              className="text-3xl font-bold mb-1"
              style={{ fontFamily: 'Lora, Georgia, serif', color: '#fff' }}
            >
              500+
            </p>
            <p className="text-sm" style={{ color: '#94a3b8' }}>
              businesses tracked
            </p>
          </div>

          <div
            className="md:border-x py-6 md:py-0"
            style={{ borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
              Trusted by consultants, VAs, and account managers across the UK
            </p>
          </div>

          <div>
            <p
              className="text-3xl font-bold mb-1"
              style={{ fontFamily: 'Lora, Georgia, serif', color: '#fff' }}
            >
              3 min
            </p>
            <p className="text-sm" style={{ color: '#94a3b8' }}>
              average to brief your whole day
            </p>
          </div>
        </div>
      </div>

      {/* Testimonials slot — add a quote grid here when real quotes are available */}
    </section>
  )
}

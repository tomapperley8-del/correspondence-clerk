const steps = [
  {
    number: '01',
    title: 'Import or paste',
    description:
      'Use the bookmarklet to pull emails from Outlook or Gmail, bulk-import your inbox, or simply paste text from any source.',
  },
  {
    number: '02',
    title: 'AI formats and files',
    description:
      'Your correspondence is cleaned up and filed by business and contact. Every word is preserved — only the formatting improves.',
  },
  {
    number: '03',
    title: 'Ask what needs doing',
    description:
      'Open the Daily Briefing. Ask "what do I need to do today?" and get a clear, prioritised answer drawn from your actual history.',
  },
]

export function HowItWorks() {
  return (
    <section className="py-24" style={{ backgroundColor: 'var(--main-bg)', borderTop: '1px solid rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="container mx-auto px-6">
        <div className="mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold"
            style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--header-bg)', letterSpacing: '-0.01em' }}
          >
            How it works
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-10">
          {steps.map((step) => (
            <div key={step.number} className="relative pl-10" style={{ borderLeft: '2px solid rgba(0,0,0,0.07)' }}>
              <p
                className="absolute -left-px top-0 text-xs font-bold tracking-widest"
                style={{ color: 'var(--link-hover)', writingMode: undefined }}
              >
                {step.number}
              </p>
              <div className="pt-6">
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--header-bg)' }}>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: '#64748b', lineHeight: '1.7' }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

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
    <section className="py-24" style={{ backgroundColor: '#FAFAF8', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="container mx-auto px-6">
        <div className="max-w-xl mb-14">
          <h2
            className="text-3xl font-bold mb-4"
            style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B' }}
          >
            How it works
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-10 max-w-4xl">
          {steps.map((step) => (
            <div key={step.number}>
              <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#7C9A5E' }}>
                {step.number}
              </p>
              <h3 className="text-base font-semibold mb-2" style={{ color: '#1E293B' }}>
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#64748b' }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

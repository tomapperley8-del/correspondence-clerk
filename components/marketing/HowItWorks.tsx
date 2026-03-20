const steps = [
  {
    number: '1',
    title: 'Import or Paste',
    description:
      'Use our bookmarklet to import emails directly from Outlook or Gmail, or simply paste text from any source.',
  },
  {
    number: '2',
    title: 'AI Formats',
    description:
      'Our AI instantly cleans up the formatting while preserving every word exactly as written. No rewrites, no summarization.',
  },
  {
    number: '3',
    title: 'File & Find',
    description:
      'Correspondence is automatically organized by business and contact. Search, export, or share whenever you need it.',
  },
]

export function HowItWorks() {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          How It Works
        </h2>
        <p className="text-xl text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          From messy email thread to organized letter file in seconds.
        </p>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                {step.number}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {step.title}
              </h3>
              <p className="text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

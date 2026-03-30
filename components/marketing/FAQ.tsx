const faqs = [
  {
    question: 'Do I need to change how I write emails or letters?',
    answer:
      'No. You paste what you already wrote — or received — and Correspondence Clerk handles the rest. There is nothing new to learn.',
  },
  {
    question: 'What does the AI actually do?',
    answer:
      'It reads each piece of correspondence and produces a clean summary, extracts key dates and actions, and flags anything that needs a reply. It never rewrites your words or invents content.',
  },
  {
    question: 'Is my correspondence data private?',
    answer:
      "Yes. Your data is stored securely in your own organisation and is never used to train AI models. Each organisation's data is fully isolated.",
  },
  {
    question: 'Can I use it without the AI formatting?',
    answer:
      'Yes. If the AI is unavailable, your entry is saved as-is. You can also edit or override any AI-generated summary at any time.',
  },
  {
    question: 'Does it work for emails and physical letters?',
    answer:
      'Yes. You can paste email text, type notes from phone calls, or log the contents of a letter. It works for anything you would write down.',
  },
  {
    question: 'What happens after the 14-day trial?',
    answer:
      'You choose a plan or your account pauses — no charges until you decide. All your data is kept safe either way.',
  },
]

export function FAQ() {
  return (
    <section className="py-20" style={{ backgroundColor: 'var(--main-bg)' }}>
      <div className="container mx-auto px-6 max-w-2xl">
        <h2
          className="text-2xl font-bold mb-10"
          style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--header-bg)' }}
        >
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group border rounded"
              style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            >
              <summary
                className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer select-none text-sm font-medium list-none"
                style={{ color: 'var(--header-bg)' }}
              >
                {faq.question}
                <span
                  className="shrink-0 transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                  style={{ color: '#2C4A6E' }}
                >
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed" style={{ color: '#475569' }}>
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

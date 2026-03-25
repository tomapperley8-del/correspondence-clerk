const features = [
  {
    title: 'Daily Briefing',
    description:
      'Ask what needs doing today. Get a prioritised list of unreplied emails, expiring contracts, and cold follow-ups — drawn from your actual correspondence history.',
  },
  {
    title: 'One-click email import',
    description:
      'A browser bookmarklet imports emails from Outlook or Gmail in a single click. Or connect your inbox and bulk-import months of past correspondence at once.',
  },
  {
    title: 'AI formatting',
    description:
      'Paste a messy email thread and get clean, chronological correspondence. Every word preserved exactly as written — no rewrites, no summaries.',
  },
  {
    title: 'Full-text search',
    description:
      'Find any conversation in seconds. Search by business, contact, subject, or content across your entire correspondence history.',
  },
  {
    title: 'Professional exports',
    description:
      'Export to PDF or Google Docs. Print-ready letter files for meetings, legal matters, or client records.',
  },
  {
    title: 'Team access',
    description:
      'Invite colleagues to manage correspondence together. Everyone works from the same organised view.',
  },
]

export function Features() {
  return (
    <section className="py-24" style={{ backgroundColor: '#fff' }}>
      <div className="container mx-auto px-6">
        <div className="mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--header-bg)', letterSpacing: '-0.01em' }}
          >
            What it actually does
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#64748b', maxWidth: '48ch' }}>
            Not a CRM. Not an email client. A focused tool that tells you what
            needs doing and keeps your correspondence in order.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-8 rounded-sm"
              style={{ backgroundColor: 'var(--main-bg)', border: '1px solid rgba(0,0,0,0.06)' }}
            >
              <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--header-bg)' }}>
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#64748b', lineHeight: '1.7' }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

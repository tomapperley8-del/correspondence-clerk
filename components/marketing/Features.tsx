const features = [
  {
    title: 'Daily Briefing Assistant',
    description:
      'Ask "what do I need to do today?" and get a prioritised list of unreplied emails, expiring contracts, and stale follow-ups — drawn from your actual correspondence history.',
    icon: '🤖',
  },
  {
    title: 'One-Click Email Import',
    description:
      'Import emails directly from Outlook Web or Gmail with our browser bookmarklet, or bulk-import months of past emails in one go.',
    icon: '📧',
  },
  {
    title: 'Clean Correspondence Filing',
    description:
      'Paste messy email threads and get clean, professionally formatted correspondence filed by business and contact. AI formats; you just paste.',
    icon: '📁',
  },
  {
    title: 'Powerful Search',
    description:
      'Full-text search across all correspondence. Find any conversation in seconds, no matter how old.',
    icon: '🔍',
  },
  {
    title: 'Professional Exports',
    description:
      'Export to PDF, Word, or Google Docs. Print-ready letter files for meetings, legal matters, or records.',
    icon: '📄',
  },
  {
    title: 'Team Collaboration',
    description:
      'Invite your team to manage correspondence together. Everyone sees the same organised view.',
    icon: '👥',
  },
]

export function Features() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          Everything you need to stay on top of business correspondence
        </h2>
        <p className="text-xl text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          From daily AI briefings to one-click email import — your correspondence, organised and accessible.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white p-6 border-2 border-gray-800"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

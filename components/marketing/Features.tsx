const features = [
  {
    title: 'AI-Powered Formatting',
    description:
      'Paste messy email threads and get clean, professionally formatted correspondence. Our AI preserves every word while making it readable.',
    icon: '✨',
  },
  {
    title: 'One-Click Email Import',
    description:
      'Import emails directly from Outlook Web or Gmail with our browser bookmarklet. No copy-pasting, no manual entry.',
    icon: '📧',
  },
  {
    title: 'Organized Letter Files',
    description:
      'Every piece of correspondence filed by business and contact. Recent items at your fingertips, older items archived.',
    icon: '📁',
  },
  {
    title: 'Professional Exports',
    description:
      'Export to PDF, Word, or Google Docs. Print-ready letter files for meetings, legal matters, or records.',
    icon: '📄',
  },
  {
    title: 'Powerful Search',
    description:
      'Full-text search across all correspondence. Find any conversation in seconds, no matter how old.',
    icon: '🔍',
  },
  {
    title: 'Team Collaboration',
    description:
      'Invite your team to manage correspondence together. Everyone sees the same organized view.',
    icon: '👥',
  },
]

export function Features() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          Everything you need to manage business correspondence
        </h2>
        <p className="text-xl text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          Stop losing important communications in cluttered inboxes.
          Keep your business correspondence organized and accessible.
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

import Link from 'next/link'

export const metadata = {
  title: 'Features - Correspondence Clerk',
  description: 'Discover all the features that make Correspondence Clerk the best way to manage business correspondence.',
}

const features = [
  {
    title: 'AI-Powered Formatting',
    description:
      'Our AI takes messy email threads and transforms them into clean, professionally formatted correspondence. Every word is preserved exactly as written - no rewrites, no summaries, just better formatting.',
    details: [
      'Automatically detects email threads and formats them chronologically',
      'Preserves original wording - your words, just cleaner',
      'Handles complex formatting from any email client',
      'Falls back gracefully if AI is unavailable',
    ],
    icon: '✨',
  },
  {
    title: 'One-Click Email Import',
    description:
      'Install our browser bookmarklet and import emails directly from Outlook Web or Gmail with a single click. No more copy-pasting or manual data entry.',
    details: [
      'Works with Outlook Web and Gmail',
      'Extracts sender, recipient, date, and subject automatically',
      'Preserves email body and formatting',
      'Secure - data goes directly to your account',
    ],
    icon: '📧',
  },
  {
    title: 'Organized Letter Files',
    description:
      'Every piece of correspondence is automatically organized by business and contact. Recent items stay at your fingertips while older correspondence is archived but searchable.',
    details: [
      'Two-section view: Recent (last 6 months) and Archive',
      'File by business and specific contact',
      'Track CC and BCC recipients',
      'Add notes and follow-up reminders',
    ],
    icon: '📁',
  },
  {
    title: 'Professional Exports',
    description:
      'Generate print-ready documents whenever you need them. Export to PDF, Word, or Google Docs with professional formatting.',
    details: [
      'PDF export for printing and sharing',
      'Word document export for editing',
      'Google Docs integration',
      'Consistent, professional layout',
    ],
    icon: '📄',
  },
  {
    title: 'Powerful Search',
    description:
      'Full-text search across all your correspondence. Find any conversation in seconds, no matter how old. Search by business name, contact, subject, or content.',
    details: [
      'Search across all businesses and contacts',
      'Filter by date range',
      'Business name prioritization in results',
      'Instant results as you type',
    ],
    icon: '🔍',
  },
  {
    title: 'Team Collaboration',
    description:
      'Invite your team members to manage correspondence together. Everyone sees the same organized view, ensuring nothing falls through the cracks.',
    details: [
      'Invite unlimited team members (Enterprise)',
      'Share access to all correspondence',
      'Audit trail of who added what',
      'Role-based permissions (Admin/Member)',
    ],
    icon: '👥',
  },
  {
    title: 'Duplicate Detection',
    description:
      'Automatically detects when the same correspondence has been entered twice. Review and merge duplicates to keep your records clean.',
    details: [
      'Automatic duplicate detection',
      'Side-by-side comparison',
      'One-click merge or dismiss',
      'Never lose track of conversations',
    ],
    icon: '🔄',
  },
  {
    title: 'Business Management',
    description:
      'Track all the details about your business contacts in one place. Store addresses, contract details, membership types, and notes.',
    details: [
      'Store business addresses and contact info',
      'Track contract dates and values',
      'Categorize by type (client, prospect, etc.)',
      'Add notes and reminders',
    ],
    icon: '🏢',
  },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b-2 border-gray-800">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Correspondence Clerk
          </Link>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="px-4 py-2 text-gray-700 font-semibold hover:text-blue-600"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 border-2 border-blue-600"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white py-16 border-b-2 border-gray-200">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Features Built for Real Business Needs
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Everything you need to manage business correspondence professionally,
            from email import to export-ready letter files.
          </p>
        </div>
      </section>

      {/* Features List */}
      <main className="container mx-auto px-4 py-16">
        <div className="space-y-16">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`grid md:grid-cols-2 gap-8 items-center ${
                index % 2 === 1 ? 'md:flex-row-reverse' : ''
              }`}
            >
              <div className={index % 2 === 1 ? 'md:order-2' : ''}>
                <div className="text-5xl mb-4">{feature.icon}</div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  {feature.title}
                </h2>
                <p className="text-lg text-gray-600 mb-6">
                  {feature.description}
                </p>
                <ul className="space-y-3">
                  {feature.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="text-green-600 font-bold">✓</span>
                      <span className="text-gray-700">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className={`bg-white border-2 border-gray-800 p-8 ${
                  index % 2 === 1 ? 'md:order-1' : ''
                }`}
              >
                <div className="text-8xl text-center opacity-20">
                  {feature.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to get started?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Try Correspondence Clerk free for 14 days. No credit card required.
          </p>
          <Link
            href="/signup"
            className="inline-block px-8 py-4 bg-blue-600 text-white font-semibold text-lg hover:bg-blue-700 border-2 border-blue-600"
          >
            Start Free Trial
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t-2 border-gray-800 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>&copy; {new Date().getFullYear()} Correspondence Clerk. All rights reserved.</p>
          <div className="mt-4 space-x-4">
            <Link href="/terms" className="hover:text-blue-600">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-blue-600">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

import Link from 'next/link'

export function Hero() {
  return (
    <section className="bg-white py-20 border-b-2 border-gray-200">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          Know exactly what needs
          <br />
          your attention today
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          An AI assistant that reads all your business correspondence and tells
          you who to reply to, which contracts are expiring, and which
          follow-ups have gone cold — every morning in seconds.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/signup"
            className="px-8 py-4 bg-blue-600 text-white font-semibold text-lg hover:bg-blue-700 border-2 border-blue-600"
          >
            Start free 14-day trial — no credit card required
          </Link>
          <Link
            href="/features"
            className="px-8 py-4 bg-white text-gray-900 font-semibold text-lg hover:bg-gray-100 border-2 border-gray-800"
          >
            See How It Works
          </Link>
        </div>

        {/* Assistant output mockup */}
        <div className="mt-14 max-w-2xl mx-auto bg-gray-50 border-2 border-gray-200 text-left p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Daily Briefing — example output</p>
          <p className="text-sm font-semibold text-gray-700 mb-3">Here&apos;s what needs your attention today:</p>
          <ul className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">!</span>
              <span><strong>Acme Ltd</strong> — no reply to your proposal sent 8 days ago. Last contact: Sarah Chen.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">!</span>
              <span><strong>Greenfield Partners</strong> — contract renews in 12 days. No renewal discussion on file yet.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 w-4 h-4 flex-shrink-0 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">i</span>
              <span><strong>3 other contacts</strong> sent emails in the last 48 hours that haven&apos;t been replied to.</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}

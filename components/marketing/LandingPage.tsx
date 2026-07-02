import Link from 'next/link'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-paper flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-semibold text-brand-dark mb-4">Correspondence Clerk</h1>
        <p className="text-gray-600 text-base leading-relaxed mb-8">
          A tool for managing business correspondence, contracts, and outreach for The Chiswick Calendar.
        </p>
        <Link
          href="/login"
          className="inline-block bg-brand-navy text-white px-8 py-3 font-semibold hover:bg-brand-navy-hover transition-colors"
        >
          Log in
        </Link>
      </div>
    </div>
  )
}

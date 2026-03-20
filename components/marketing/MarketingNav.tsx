import Link from 'next/link'

export function MarketingNav() {
  return (
    <header className="bg-white border-b-2 border-gray-800">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-gray-900">
          Correspondence Clerk
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/features"
            className="text-gray-700 font-medium hover:text-blue-600"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="text-gray-700 font-medium hover:text-blue-600"
          >
            Pricing
          </Link>
        </nav>
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
  )
}

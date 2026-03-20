import Link from 'next/link'

export function Hero() {
  return (
    <section className="bg-white py-20 border-b-2 border-gray-200">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          Turn messy correspondence
          <br />
          into organized letter files
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          AI-powered formatting, email import, and professional exports.
          Stop wrestling with scattered emails and start maintaining clean,
          chronological business correspondence.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/signup"
            className="px-8 py-4 bg-blue-600 text-white font-semibold text-lg hover:bg-blue-700 border-2 border-blue-600"
          >
            Start Free 14-Day Trial
          </Link>
          <Link
            href="/features"
            className="px-8 py-4 bg-white text-gray-900 font-semibold text-lg hover:bg-gray-100 border-2 border-gray-800"
          >
            See How It Works
          </Link>
        </div>
        <p className="mt-4 text-gray-500">No credit card required</p>
      </div>
    </section>
  )
}

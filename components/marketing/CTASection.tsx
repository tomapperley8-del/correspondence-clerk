import Link from 'next/link'

export function CTASection() {
  return (
    <section className="py-20 bg-blue-600">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Ready to organize your correspondence?
        </h2>
        <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
          Join businesses that have transformed their correspondence management.
          Start your free 14-day trial today.
        </p>
        <Link
          href="/signup"
          className="inline-block px-8 py-4 bg-white text-blue-600 font-semibold text-lg hover:bg-gray-100 border-2 border-white"
        >
          Start Free Trial
        </Link>
        <p className="mt-4 text-blue-200">No credit card required</p>
      </div>
    </section>
  )
}

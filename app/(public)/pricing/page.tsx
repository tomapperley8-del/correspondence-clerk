import Link from 'next/link'
import { PLANS, type PlanId } from '@/lib/stripe/config'

export const metadata = {
  title: 'Pricing - Correspondence Clerk',
  description: 'Choose the right plan for your business correspondence management needs.',
}

export default function PricingPage() {
  const planOrder: PlanId[] = ['trial', 'pro', 'enterprise']

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

      {/* Pricing Content */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Start with a free 14-day trial. No credit card required.
            Upgrade when you are ready.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {planOrder.map((planId) => {
            const plan = PLANS[planId]
            const isHighlighted = plan.highlighted

            return (
              <div
                key={planId}
                className={`bg-white p-8 ${
                  isHighlighted
                    ? 'border-4 border-blue-600 relative'
                    : 'border-2 border-gray-800'
                }`}
              >
                {isHighlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 text-sm font-bold">
                    Most Popular
                  </div>
                )}

                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {plan.name}
                </h2>
                <p className="text-gray-600 mb-4">{plan.description}</p>

                <div className="mb-6">
                  {plan.priceMonthly !== null ? (
                    <>
                      <span className="text-4xl font-bold text-gray-900">
                        ${plan.priceMonthly}
                      </span>
                      <span className="text-gray-600">/month</span>
                      {plan.priceYearly && (
                        <p className="text-sm text-gray-500 mt-1">
                          or ${plan.priceYearly}/year (save ${plan.priceMonthly * 12 - plan.priceYearly})
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-4xl font-bold text-gray-900">Free</span>
                  )}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-green-600 font-bold">✓</span>
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={planId === 'trial' ? '/signup' : `/signup?plan=${planId}`}
                  className={`block text-center py-3 font-semibold ${
                    isHighlighted
                      ? 'bg-blue-600 text-white hover:bg-blue-700 border-2 border-blue-600'
                      : 'bg-white text-gray-900 hover:bg-gray-100 border-2 border-gray-800'
                  }`}
                >
                  {planId === 'trial' ? 'Start Free Trial' : `Get ${plan.name}`}
                </Link>
              </div>
            )
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            <div className="bg-white border-2 border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-2">
                What happens after my trial ends?
              </h3>
              <p className="text-gray-600">
                After your 14-day trial, you will need to upgrade to a paid plan
                to continue using Correspondence Clerk. Your data is preserved
                and waiting for you.
              </p>
            </div>

            <div className="bg-white border-2 border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-2">
                Can I change plans later?
              </h3>
              <p className="text-gray-600">
                Yes, you can upgrade or downgrade your plan at any time. Changes
                take effect immediately, and we will prorate any differences.
              </p>
            </div>

            <div className="bg-white border-2 border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-2">
                What payment methods do you accept?
              </h3>
              <p className="text-gray-600">
                We accept all major credit cards including Visa, Mastercard,
                American Express, and Discover. Enterprise customers can pay by
                invoice.
              </p>
            </div>

            <div className="bg-white border-2 border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-2">
                Do you offer refunds?
              </h3>
              <p className="text-gray-600">
                If you are not satisfied within the first 30 days of your paid
                subscription, contact us for a full refund.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t-2 border-gray-800 py-8 mt-16">
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

import Link from 'next/link'
import { PLANS, type PlanId } from '@/lib/stripe/config'

export function Pricing() {
  const planOrder: PlanId[] = ['trial', 'pro', 'enterprise']

  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-gray-900 text-center mb-4">
          Simple, Transparent Pricing
        </h2>
        <p className="text-xl text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          Start free, upgrade when you are ready.
        </p>

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

                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {plan.name}
                </h3>

                <div className="mb-4">
                  {plan.priceMonthly !== null ? (
                    <>
                      <span className="text-4xl font-bold text-gray-900">
                        ${plan.priceMonthly}
                      </span>
                      <span className="text-gray-600">/month</span>
                    </>
                  ) : (
                    <span className="text-4xl font-bold text-gray-900">
                      Free
                    </span>
                  )}
                </div>

                <ul className="space-y-2 mb-6 text-sm">
                  {plan.features.slice(0, 4).map((feature, index) => (
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

        <p className="text-center mt-8">
          <Link
            href="/pricing"
            className="text-blue-600 font-semibold hover:underline"
          >
            See full pricing details →
          </Link>
        </p>
      </div>
    </section>
  )
}

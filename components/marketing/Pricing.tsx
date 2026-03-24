import Link from 'next/link'
import { PLANS, type PlanId } from '@/lib/stripe/config'

export function Pricing() {
  const planOrder: PlanId[] = ['trial', 'pro', 'enterprise']

  return (
    <section className="py-24" style={{ backgroundColor: '#fff', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
      <div className="container mx-auto px-6">
        <div className="max-w-xl mb-14">
          <h2
            className="text-3xl font-bold mb-4"
            style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B' }}
          >
            Pricing
          </h2>
          <p className="text-base" style={{ color: '#475569' }}>
            Start free. Upgrade when you&apos;re ready.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl">
          {planOrder.map((planId) => {
            const plan = PLANS[planId]

            return (
              <div
                key={planId}
                className="p-8"
                style={{ border: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#FAFAF8' }}
              >
                <h3 className="text-base font-semibold mb-4" style={{ color: '#1E293B' }}>
                  {plan.name}
                </h3>

                <div className="mb-6">
                  {plan.priceMonthly !== null ? (
                    <>
                      <span className="text-3xl font-bold" style={{ color: '#1E293B' }}>
                        ${plan.priceMonthly}
                      </span>
                      <span className="text-sm ml-1" style={{ color: '#94a3b8' }}>/month</span>
                    </>
                  ) : (
                    <span className="text-3xl font-bold" style={{ color: '#1E293B' }}>Free</span>
                  )}
                </div>

                <ul className="space-y-2 mb-8">
                  {plan.features.slice(0, 4).map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm" style={{ color: '#475569' }}>
                      <span className="mt-0.5 shrink-0 text-xs" style={{ color: '#7C9A5E' }}>—</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={planId === 'trial' ? '/signup' : `/signup?plan=${planId}`}
                  className="block text-center text-sm font-medium py-2.5"
                  style={{ backgroundColor: '#2C4A6E', color: '#fff' }}
                >
                  {planId === 'trial' ? 'Start free trial' : `Get ${plan.name}`}
                </Link>
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-sm">
          <Link href="/pricing" style={{ color: '#2C4A6E' }} className="font-medium hover:underline">
            See full pricing details
          </Link>
        </p>
      </div>
    </section>
  )
}

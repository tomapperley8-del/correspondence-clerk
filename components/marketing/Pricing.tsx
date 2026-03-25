import Link from 'next/link'
import { PLANS, type PlanId } from '@/lib/stripe/config'

export function Pricing() {
  const planOrder: PlanId[] = ['trial', 'pro', 'enterprise']

  return (
    <section className="py-24" style={{ backgroundColor: '#fff' }}>
      <div className="container mx-auto px-6">
        <div className="mb-16">
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--header-bg)', letterSpacing: '-0.01em' }}
          >
            Pricing
          </h2>
          <p className="text-base" style={{ color: '#64748b' }}>
            Start free. Upgrade when you&apos;re ready.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl">
          {planOrder.map((planId) => {
            const plan = PLANS[planId]
            const isHighlighted = plan.highlighted

            return (
              <div
                key={planId}
                className="p-8 rounded-sm flex flex-col"
                style={{
                  backgroundColor: isHighlighted ? 'var(--header-bg)' : 'var(--main-bg)',
                  border: isHighlighted ? 'none' : '1px solid rgba(0,0,0,0.08)',
                }}
              >
                <div className="mb-6">
                  <h3
                    className="text-sm font-semibold uppercase tracking-wider mb-4"
                    style={{ color: isHighlighted ? 'var(--link-hover)' : '#94a3b8', letterSpacing: '0.08em' }}
                  >
                    {plan.name}
                  </h3>
                  {plan.priceMonthly !== null ? (
                    <div>
                      <span
                        className="text-4xl font-bold"
                        style={{ fontFamily: 'Lora, Georgia, serif', color: isHighlighted ? '#fff' : 'var(--header-bg)' }}
                      >
                        £{plan.priceMonthly}
                      </span>
                      <span className="text-sm ml-1" style={{ color: isHighlighted ? '#94a3b8' : '#94a3b8' }}>/mo</span>
                    </div>
                  ) : (
                    <span
                      className="text-4xl font-bold"
                      style={{ fontFamily: 'Lora, Georgia, serif', color: isHighlighted ? '#fff' : 'var(--header-bg)' }}
                    >
                      Free
                    </span>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.slice(0, 4).map((feature, index) => (
                    <li key={index} className="flex items-start gap-3 text-sm" style={{ color: isHighlighted ? '#cbd5e1' : '#475569' }}>
                      <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full block" style={{ backgroundColor: isHighlighted ? 'var(--link-hover)' : '#cbd5e1' }} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={planId === 'trial' ? '/signup' : `/signup?plan=${planId}`}
                  className="block text-center text-sm font-semibold py-3 transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: isHighlighted ? 'var(--link-hover)' : 'var(--link-blue)',
                    color: '#fff',
                  }}
                >
                  {planId === 'trial' ? 'Start free trial' : `Get ${plan.name}`}
                </Link>
              </div>
            )
          })}
        </div>

        <p className="mt-10 text-sm">
          <Link href="/pricing" style={{ color: 'var(--link-blue)' }} className="font-medium hover:underline">
            Full pricing details
          </Link>
        </p>
      </div>
    </section>
  )
}

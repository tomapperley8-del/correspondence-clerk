import Link from 'next/link'
import { PLANS, type PlanId } from '@/lib/stripe/config'
import { MarketingNav } from '@/components/marketing/MarketingNav'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

export const metadata = {
  title: 'Pricing - Correspondence Clerk',
  description: 'Choose the right plan for your business correspondence management needs.',
}

export default function PricingPage() {
  const planOrder: PlanId[] = ['trial', 'pro', 'enterprise']

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--main-bg)' }}>
      <MarketingNav />

      <main className="container mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1
            className="text-4xl font-bold mb-4"
            style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--header-bg)' }}
          >
            Simple, transparent pricing
          </h1>
          <p className="text-lg max-w-xl mx-auto" style={{ color: '#475569' }}>
            Start with a free 14-day trial. No credit card required. Upgrade when you&apos;re ready.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {planOrder.map((planId) => {
            const plan = PLANS[planId]
            const isHighlighted = plan.highlighted

            return (
              <div
                key={planId}
                className="p-8 rounded-sm"
                style={
                  isHighlighted
                    ? { backgroundColor: 'var(--header-bg)', color: '#fff' }
                    : {
                        backgroundColor: '#fff',
                        border: '1px solid rgba(0,0,0,0.08)',
                        color: 'var(--header-bg)',
                      }
                }
              >
                <h2
                  className="text-xl font-bold mb-2"
                  style={{ fontFamily: 'Lora, Georgia, serif' }}
                >
                  {plan.name}
                </h2>
                <p
                  className="text-sm mb-6"
                  style={{ color: isHighlighted ? '#94a3b8' : '#64748b' }}
                >
                  {plan.description}
                </p>

                <div className="mb-8">
                  {plan.priceMonthly !== null ? (
                    <>
                      <span className="text-4xl font-bold">£{plan.priceMonthly}</span>
                      <span
                        className="text-sm ml-1"
                        style={{ color: isHighlighted ? '#94a3b8' : '#64748b' }}
                      >
                        /month
                      </span>
                      {plan.priceYearly && (
                        <p
                          className="text-xs mt-1"
                          style={{ color: isHighlighted ? '#64748b' : '#94a3b8' }}
                        >
                          or £{plan.priceYearly}/year (save £
                          {plan.priceMonthly * 12 - plan.priceYearly})
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-4xl font-bold">Free</span>
                  )}
                </div>

                <ul className="space-y-2 mb-8 text-sm">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span style={{ color: 'var(--link-hover)' }}>–</span>
                      <span style={{ color: isHighlighted ? '#cbd5e1' : '#475569' }}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={planId === 'trial' ? '/signup' : `/signup?plan=${planId}`}
                  className="block text-center py-2.5 text-sm font-semibold rounded-sm transition-opacity hover:opacity-90"
                  style={
                    isHighlighted
                      ? { backgroundColor: 'var(--link-hover)', color: '#fff' }
                      : { backgroundColor: 'var(--link-blue)', color: '#fff' }
                  }
                >
                  {planId === 'trial' ? 'Start free trial' : `Get ${plan.name}`}
                </Link>
              </div>
            )
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-2xl mx-auto mt-24">
          <h2
            className="text-2xl font-bold mb-10 text-center"
            style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--header-bg)' }}
          >
            Frequently asked questions
          </h2>

          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
            {[
              {
                q: 'What happens after my trial ends?',
                a: 'After your 14-day trial, you will need to upgrade to a paid plan to continue using Correspondence Clerk. Your data is preserved and waiting for you.',
              },
              {
                q: 'Can I change plans later?',
                a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we will prorate any differences.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit cards including Visa, Mastercard, and American Express. Enterprise customers can pay by invoice.',
              },
              {
                q: 'Do you offer refunds?',
                a: 'If you are not satisfied within the first 30 days of your paid subscription, contact us for a full refund.',
              },
            ].map(({ q, a }) => (
              <div
                key={q}
                className="py-6"
                style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
              >
                <h3 className="font-semibold mb-2" style={{ color: 'var(--header-bg)' }}>
                  {q}
                </h3>
                <p className="text-sm" style={{ color: '#64748b' }}>
                  {a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  )
}

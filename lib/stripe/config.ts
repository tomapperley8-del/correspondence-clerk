/**
 * Stripe plan configuration
 * Defines pricing, limits, and features for each subscription tier
 */

export type PlanId = 'trial' | 'pro' | 'enterprise'

export interface PlanConfig {
  name: string
  description: string
  priceMonthly: number | null
  priceYearly: number | null
  seats: number
  aiRequests: number
  trialDays?: number
  stripePriceIdMonthly?: string
  stripePriceIdYearly?: string
  features: string[]
  highlighted?: boolean
}

export const PLANS: Record<PlanId, PlanConfig> = {
  trial: {
    name: 'Free Trial',
    description: 'Try Correspondence Clerk free for 14 days',
    priceMonthly: null,
    priceYearly: null,
    seats: 3,
    aiRequests: 100,
    trialDays: 14,
    features: [
      'Basic correspondence management',
      'Up to 3 team members',
      'Email import (Outlook & Gmail)',
      'PDF & Word export',
      'AI-powered formatting',
    ],
  },
  pro: {
    name: 'Pro',
    description: 'For growing businesses',
    priceMonthly: 29,
    priceYearly: 290,
    seats: 10,
    aiRequests: 1000,
    stripePriceIdMonthly: process.env.STRIPE_PRO_PRICE_ID_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_PRO_PRICE_ID_YEARLY,
    features: [
      'Everything in Trial',
      'Up to 10 team members',
      '1,000 AI requests/month',
      'Priority support',
      'Google Docs export',
      'Advanced search',
    ],
    highlighted: true,
  },
  enterprise: {
    name: 'Enterprise',
    description: 'For large organizations',
    priceMonthly: 99,
    priceYearly: 990,
    seats: -1, // unlimited
    aiRequests: -1, // unlimited
    stripePriceIdMonthly: process.env.STRIPE_ENTERPRISE_PRICE_ID_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_ENTERPRISE_PRICE_ID_YEARLY,
    features: [
      'Everything in Pro',
      'Unlimited team members',
      'Unlimited AI requests',
      'Custom branding',
      'API access',
      'SSO integration',
      'Dedicated support',
    ],
  },
}

/**
 * Get plan configuration by ID
 */
export function getPlan(planId: PlanId): PlanConfig {
  return PLANS[planId]
}

/**
 * Get the Stripe price ID for a plan
 */
export function getStripePriceId(planId: PlanId, yearly = false): string | undefined {
  const plan = PLANS[planId]
  return yearly ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly
}

/**
 * Check if a plan has unlimited seats
 */
export function hasUnlimitedSeats(planId: PlanId): boolean {
  return PLANS[planId].seats === -1
}

/**
 * Check if a plan has unlimited AI requests
 */
export function hasUnlimitedAI(planId: PlanId): boolean {
  return PLANS[planId].aiRequests === -1
}

/**
 * Trial duration in days
 */
export const TRIAL_DAYS = 14

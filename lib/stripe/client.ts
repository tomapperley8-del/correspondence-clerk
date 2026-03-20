import Stripe from 'stripe'
import { isFeatureEnabled } from '@/lib/feature-flags'

let stripeInstance: Stripe | null = null

/**
 * Get the Stripe client instance
 * Returns null if billing feature is disabled or Stripe key is not set
 */
export function getStripe(): Stripe | null {
  if (!isFeatureEnabled('billing')) {
    return null
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('Stripe secret key not configured')
    return null
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    })
  }

  return stripeInstance
}

/**
 * Verify that Stripe is properly configured
 */
export function isStripeConfigured(): boolean {
  return (
    isFeatureEnabled('billing') &&
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.STRIPE_WEBHOOK_SECRET
  )
}

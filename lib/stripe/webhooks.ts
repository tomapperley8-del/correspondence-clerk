import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { PLANS, type PlanId } from './config'

// Use service role client for webhook handlers
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Log a billing event for audit trail
 */
async function logBillingEvent(
  organizationId: string,
  eventType: string,
  stripeEventId: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = getServiceClient()
  await supabase.from('billing_events').insert({
    organization_id: organizationId,
    event_type: eventType,
    stripe_event_id: stripeEventId,
    metadata,
  })
}

/**
 * Get organization by Stripe customer ID
 */
async function getOrganizationByCustomerId(customerId: string) {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, subscription_plan, subscription_status')
    .eq('stripe_customer_id', customerId)
    .single()

  if (error) {
    console.error('Failed to find organization by customer ID:', error)
    return null
  }

  return data
}

/**
 * Map Stripe price ID to our plan ID
 */
function getPlanFromPriceId(priceId: string): PlanId {
  for (const [planId, plan] of Object.entries(PLANS)) {
    if (
      plan.stripePriceIdMonthly === priceId ||
      plan.stripePriceIdYearly === priceId
    ) {
      return planId as PlanId
    }
  }
  return 'pro' // Default to pro if price ID not found
}

/**
 * Handle checkout.session.completed
 * Activates subscription after successful checkout
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string
) {
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  const org = await getOrganizationByCustomerId(customerId)
  if (!org) {
    console.error('No organization found for customer:', customerId)
    return
  }

  const supabase = getServiceClient()

  // Get subscription details to determine plan
  let planId: PlanId = 'pro'
  if (session.metadata?.plan_id) {
    planId = session.metadata.plan_id as PlanId
  }

  const plan = PLANS[planId]

  // Update organization with subscription details
  const { error } = await supabase
    .from('organizations')
    .update({
      stripe_subscription_id: subscriptionId,
      subscription_plan: planId,
      subscription_status: 'active',
      trial_ends_at: null,
      seats_limit: plan.seats,
      ai_requests_limit: plan.aiRequests,
    })
    .eq('id', org.id)

  if (error) {
    console.error('Failed to update organization:', error)
    return
  }

  await logBillingEvent(org.id, 'checkout.session.completed', eventId, {
    subscription_id: subscriptionId,
    plan_id: planId,
  })

  console.log(`Organization ${org.id} upgraded to ${planId}`)
}

/**
 * Handle customer.subscription.updated
 * Handles plan changes
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  eventId: string
) {
  const customerId = subscription.customer as string
  const org = await getOrganizationByCustomerId(customerId)

  if (!org) {
    console.error('No organization found for customer:', customerId)
    return
  }

  const supabase = getServiceClient()

  // Determine plan from price ID
  const priceId = subscription.items.data[0]?.price.id
  const planId = priceId ? getPlanFromPriceId(priceId) : 'pro'
  const plan = PLANS[planId]

  // Map Stripe status to our status
  type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
  const statusMap: Record<string, SubscriptionStatus> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    incomplete: 'unpaid',
    incomplete_expired: 'canceled',
    paused: 'active', // Treat paused as active for now
  }

  const status = statusMap[subscription.status] || 'active'

  const { error } = await supabase
    .from('organizations')
    .update({
      subscription_plan: planId,
      subscription_status: status,
      seats_limit: plan.seats,
      ai_requests_limit: plan.aiRequests,
    })
    .eq('id', org.id)

  if (error) {
    console.error('Failed to update subscription:', error)
    return
  }

  await logBillingEvent(org.id, 'customer.subscription.updated', eventId, {
    plan_id: planId,
    status,
    stripe_status: subscription.status,
  })

  console.log(`Organization ${org.id} subscription updated to ${planId} (${status})`)
}

/**
 * Handle customer.subscription.deleted
 * Handles cancellation
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  eventId: string
) {
  const customerId = subscription.customer as string
  const org = await getOrganizationByCustomerId(customerId)

  if (!org) {
    console.error('No organization found for customer:', customerId)
    return
  }

  const supabase = getServiceClient()

  // Downgrade to trial limits but mark as canceled
  const { error } = await supabase
    .from('organizations')
    .update({
      subscription_status: 'canceled',
      // Keep current plan for reference, but limits will be enforced
      seats_limit: PLANS.trial.seats,
      ai_requests_limit: PLANS.trial.aiRequests,
    })
    .eq('id', org.id)

  if (error) {
    console.error('Failed to handle subscription cancellation:', error)
    return
  }

  await logBillingEvent(org.id, 'customer.subscription.deleted', eventId, {
    previous_plan: org.subscription_plan,
  })

  console.log(`Organization ${org.id} subscription canceled`)
}

/**
 * Handle invoice.payment_failed
 */
export async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  eventId: string
) {
  const customerId = invoice.customer as string
  const org = await getOrganizationByCustomerId(customerId)

  if (!org) {
    console.error('No organization found for customer:', customerId)
    return
  }

  const supabase = getServiceClient()

  const { error } = await supabase
    .from('organizations')
    .update({
      subscription_status: 'past_due',
    })
    .eq('id', org.id)

  if (error) {
    console.error('Failed to update payment status:', error)
    return
  }

  await logBillingEvent(org.id, 'invoice.payment_failed', eventId, {
    invoice_id: invoice.id,
    amount: invoice.amount_due,
  })

  console.log(`Organization ${org.id} payment failed`)
}

/**
 * Handle invoice.payment_succeeded
 */
export async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  eventId: string
) {
  const customerId = invoice.customer as string
  const org = await getOrganizationByCustomerId(customerId)

  if (!org) {
    console.error('No organization found for customer:', customerId)
    return
  }

  const supabase = getServiceClient()

  // Reset AI usage counter on successful payment
  const { error } = await supabase
    .from('organizations')
    .update({
      subscription_status: 'active',
      ai_requests_used: 0,
      ai_requests_reset_at: new Date().toISOString(),
    })
    .eq('id', org.id)

  if (error) {
    console.error('Failed to update payment status:', error)
    return
  }

  await logBillingEvent(org.id, 'invoice.payment_succeeded', eventId, {
    invoice_id: invoice.id,
    amount: invoice.amount_paid,
  })

  console.log(`Organization ${org.id} payment succeeded`)
}

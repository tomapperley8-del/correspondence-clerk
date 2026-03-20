import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { PLANS, type PlanId } from '@/lib/stripe/config'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Billing not enabled' },
      { status: 503 }
    )
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe not initialized' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return NextResponse.json(
      { error: 'No organization found' },
      { status: 400 }
    )
  }

  // Get request body
  const body = await request.json()
  const { planId, yearly = false } = body as { planId: PlanId; yearly?: boolean }

  // Validate plan
  const plan = PLANS[planId]
  if (!plan || planId === 'trial') {
    return NextResponse.json(
      { error: 'Invalid plan' },
      { status: 400 }
    )
  }

  const priceId = yearly ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly
  if (!priceId) {
    return NextResponse.json(
      { error: 'Price not configured for this plan' },
      { status: 400 }
    )
  }

  // Get organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, stripe_customer_id, billing_email')
    .eq('id', organizationId)
    .single()

  if (orgError || !org) {
    return NextResponse.json(
      { error: 'Organization not found' },
      { status: 404 }
    )
  }

  try {
    // Create or get Stripe customer
    let customerId = org.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.billing_email || user.email || undefined,
        metadata: {
          organization_id: org.id,
          organization_name: org.name,
        },
      })

      customerId = customer.id

      // Store customer ID
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id)
    }

    // Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/settings/billing?success=true`,
      cancel_url: `${appUrl}/settings/billing?canceled=true`,
      metadata: {
        organization_id: org.id,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          organization_id: org.id,
          plan_id: planId,
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Failed to create checkout session:', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

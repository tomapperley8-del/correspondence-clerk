import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, isStripeConfigured } from '@/lib/stripe/client'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export async function POST() {
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

  // Get organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, stripe_customer_id')
    .eq('id', organizationId)
    .single()

  if (orgError || !org) {
    return NextResponse.json(
      { error: 'Organization not found' },
      { status: 404 }
    )
  }

  if (!org.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe first.' },
      { status: 400 }
    )
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/settings/billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Failed to create billing portal session:', err)
    return NextResponse.json(
      { error: 'Failed to create billing portal' },
      { status: 500 }
    )
  }
}

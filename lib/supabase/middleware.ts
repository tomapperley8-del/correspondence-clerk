import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require subscription check
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/auth',
  '/invite',
  '/',
  '/pricing',
  '/terms',
  '/privacy',
  '/features',
  '/api/stripe/webhook',
  '/api/bookmarklet-code',
  '/install-bookmarklet',
  '/bookmarklet',
]

// Routes that specifically need billing access even with expired trial
const BILLING_ROUTES = ['/settings/billing']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Check if this is a public route (no auth or subscription check needed)
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )

  if (isPublicRoute) {
    return response
  }

  // If no user and not a public route, let the app handle auth redirect
  if (!user) {
    return response
  }

  // Check billing status only if billing feature is enabled
  const billingEnabled = process.env.FEATURE_BILLING_ENABLED === 'true'

  if (billingEnabled) {
    // Allow access to billing routes even with expired trial
    const isBillingRoute = BILLING_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route)
    )

    if (!isBillingRoute) {
      // Get user's organization subscription status
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (profile?.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('subscription_status, trial_ends_at')
          .eq('id', profile.organization_id)
          .single()

        if (org) {
          // Check for expired trial
          if (org.subscription_status === 'trialing' && org.trial_ends_at) {
            const trialEndsAt = new Date(org.trial_ends_at)
            if (trialEndsAt < new Date()) {
              // Trial expired - redirect to billing
              const url = request.nextUrl.clone()
              url.pathname = '/settings/billing'
              url.searchParams.set('expired', '1')
              return NextResponse.redirect(url)
            }
          }

          // Check for canceled or unpaid subscription
          if (
            org.subscription_status === 'canceled' ||
            org.subscription_status === 'unpaid'
          ) {
            const url = request.nextUrl.clone()
            url.pathname = '/settings/billing'
            url.searchParams.set('status', org.subscription_status)
            return NextResponse.redirect(url)
          }
        }
      }
    }
  }

  return response
}

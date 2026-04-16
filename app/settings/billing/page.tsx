'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getBillingInfo, getTrialDaysRemaining, type BillingInfo } from '@/app/actions/billing'
import { PLANS, type PlanId } from '@/lib/stripe/config'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { checkUserRole } from '@/app/actions/user-profile'

function BillingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null)
  const [trialDays, setTrialDays] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [isOpeningPortal, setIsOpeningPortal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const billingEnabled = isFeatureEnabled('billing')

  useEffect(() => {
    loadBillingInfo()

    // Check URL params for success/cancel
    if (searchParams.get('success')) {
      setSuccess('Your subscription has been updated successfully.')
    } else if (searchParams.get('canceled')) {
      setError('Checkout was canceled.')
    } else if (searchParams.get('expired')) {
      setError('Your trial has expired. Please upgrade to continue.')
    }
  }, [searchParams])

  async function loadBillingInfo() {
    setIsLoading(true)

    // Check if user is admin
    const roleResult = await checkUserRole()
    setIsAdmin(roleResult.data?.role === 'admin')

    const result = await getBillingInfo()
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setBillingInfo(result.data)
    }

    const days = await getTrialDaysRemaining()
    setTrialDays(days)

    setIsLoading(false)
  }

  async function handleUpgrade(planId: PlanId) {
    setIsUpgrading(true)
    setError(null)

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, yearly: false }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout')
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start upgrade')
      setIsUpgrading(false)
    }
  }

  async function handleManageBilling() {
    setIsOpeningPortal(true)
    setError(null)

    try {
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open billing portal')
      }

      // Redirect to Stripe Billing Portal
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal')
      setIsOpeningPortal(false)
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-600">Loading billing information...</p>
      </div>
    )
  }

  if (!billingEnabled) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">Billing</h1>
        <p className="text-gray-600 mb-8">
          Billing is not enabled for this instance.
        </p>
        <Button
          variant="outline"
          onClick={() => router.push('/settings')}
          className="border-2 border-gray-800"
        >
          Back to Settings
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">Billing & Subscription</h1>
      <p className="text-gray-600 mb-8">
        Manage your subscription and billing settings.
      </p>

      {/* Navigation to other settings pages */}
      <div className="flex gap-1 mb-8 pb-6 border-b-2 border-gray-300 flex-wrap">
        <Link href="/settings" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Profile</Link>
        <Link href="/settings?tab=email" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Email</Link>
        <Link href="/settings/organization" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Organisation</Link>
        <Link href="/settings?tab=tools" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Tools</Link>
        <Link href="/settings/billing" className="px-4 py-2 font-semibold bg-brand-navy text-white border border-brand-navy">Billing</Link>
        <Link href="/settings?tab=account" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Account</Link>
      </div>

      {error && (
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="border-2 border-green-600 bg-green-50 px-4 py-3 mb-6">
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      {billingInfo && (
        <>
          {/* Current Plan */}
          <div className="bg-white border-2 border-gray-800 p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Current Plan</h2>

            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {PLANS[billingInfo.plan].name}
                </p>
                <p className="text-gray-600">
                  {billingInfo.status === 'trialing' && trialDays !== null && (
                    <span className="text-orange-600 font-semibold">
                      {trialDays} days remaining in trial
                    </span>
                  )}
                  {billingInfo.status === 'active' && (
                    <span className="text-green-600 font-semibold">Active</span>
                  )}
                  {billingInfo.status === 'past_due' && (
                    <span className="text-red-600 font-semibold">Payment Past Due</span>
                  )}
                  {billingInfo.status === 'canceled' && (
                    <span className="text-red-600 font-semibold">Canceled</span>
                  )}
                </p>
              </div>

              {billingInfo.hasStripeSubscription && isAdmin && (
                <Button
                  onClick={handleManageBilling}
                  disabled={isOpeningPortal}
                  className="bg-gray-800 text-white hover:bg-gray-900"
                >
                  {isOpeningPortal ? 'Opening...' : 'Manage Billing'}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
              <div>
                <p className="text-sm text-gray-600">Team Members</p>
                <p className="font-semibold">
                  {billingInfo.seatsUsed} / {billingInfo.seatsLimit === -1 ? 'Unlimited' : billingInfo.seatsLimit}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">AI Requests This Month</p>
                <p className="font-semibold">
                  {billingInfo.aiRequestsUsed} / {billingInfo.aiRequestsLimit === -1 ? 'Unlimited' : billingInfo.aiRequestsLimit}
                </p>
              </div>
            </div>
          </div>

          {/* Upgrade Options (only show for trial/pro users and admins) */}
          {isAdmin && billingInfo.plan !== 'enterprise' && (
            <div className="bg-white border-2 border-gray-800 p-6 mb-6">
              <h2 className="text-xl font-bold mb-4 text-gray-900">Upgrade Your Plan</h2>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Pro Plan */}
                {billingInfo.plan === 'trial' && (
                  <div className="border-2 border-brand-navy p-4">
                    <h3 className="text-lg font-bold text-gray-900">{PLANS.pro.name}</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      ${PLANS.pro.priceMonthly}<span className="text-sm text-gray-600">/month</span>
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                      {PLANS.pro.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-green-600">✓</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => handleUpgrade('pro')}
                      disabled={isUpgrading}
                      className="w-full mt-4 bg-brand-navy text-white hover:bg-brand-navy-hover"
                    >
                      {isUpgrading ? 'Processing...' : 'Upgrade to Pro'}
                    </Button>
                  </div>
                )}

                {/* Enterprise Plan */}
                <div className="border-2 border-gray-800 p-4">
                  <h3 className="text-lg font-bold text-gray-900">{PLANS.enterprise.name}</h3>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    ${PLANS.enterprise.priceMonthly}<span className="text-sm text-gray-600">/month</span>
                  </p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {PLANS.enterprise.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-green-600">✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handleUpgrade('enterprise')}
                    disabled={isUpgrading}
                    className="w-full mt-4 bg-gray-800 text-white hover:bg-gray-900"
                  >
                    {isUpgrading ? 'Processing...' : 'Upgrade to Enterprise'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Non-admin notice */}
          {!isAdmin && billingInfo.plan !== 'enterprise' && (
            <div className="bg-yellow-50 border-2 border-yellow-600 p-4 mb-6">
              <p className="text-yellow-800">
                Only organization admins can manage billing. Contact your admin to upgrade.
              </p>
            </div>
          )}
        </>
      )}

      {/* Back to Settings */}
      <Button
        variant="outline"
        onClick={() => router.push('/settings')}
        className="border-2 border-gray-800"
      >
        Back to Settings
      </Button>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <p className="text-gray-600">Loading billing information...</p>
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  )
}

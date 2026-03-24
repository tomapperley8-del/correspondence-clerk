'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { validateInvitationToken, acceptInvitation } from '@/app/actions/invitations'

function LeftPanel() {
  return (
    <div
      className="hidden md:flex md:w-2/5 flex-col justify-between p-12"
      style={{ backgroundColor: '#1E293B' }}
    >
      <Link
        href="/"
        className="text-xl font-bold text-white"
        style={{ fontFamily: 'Lora, Georgia, serif' }}
      >
        Correspondence Clerk
      </Link>
      <div>
        <p
          className="text-2xl font-semibold text-white leading-snug mb-3"
          style={{ fontFamily: 'Lora, Georgia, serif' }}
        >
          Know exactly what needs your attention today.
        </p>
        <p className="text-sm" style={{ color: '#94a3b8' }}>
          Your business correspondence, organised and ready to act on.
        </p>
      </div>
      <p className="text-xs" style={{ color: '#475569' }}>
        &copy; {new Date().getFullYear()} Correspondence Clerk
      </p>
    </div>
  )
}

function SignupPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const invitationToken = searchParams.get('invitation_token')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [organizationName, setOrganizationName] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function checkInvitation() {
      if (invitationToken) {
        const result = await validateInvitationToken(invitationToken)
        if (result.error) {
          setError(result.error)
        } else if (result.data) {
          setOrganizationName(result.data.organizations?.name || null)
        }
      }
    }
    checkInvitation()
  }, [invitationToken])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy')
      return
    }

    setIsLoading(true)

    const redirectUrl = invitationToken
      ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?invitation_token=${invitationToken}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    })

    if (signupError) {
      setError(signupError.message)
      setIsLoading(false)
      return
    }

    if (data.session && data.user) {
      if (invitationToken) {
        const result = await acceptInvitation(invitationToken, data.user.id)
        if (result.error) {
          setError(result.error)
          setIsLoading(false)
          return
        }
      }
      router.push(invitationToken ? '/dashboard' : '/onboarding/create-organization')
      return
    }

    setSuccess(true)
    setIsLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex">
        <LeftPanel />
        <div
          className="flex-1 flex items-center justify-center px-6 py-12"
          style={{ backgroundColor: '#FAFAF8' }}
        >
          <div className="w-full max-w-sm">
            <h1
              className="text-2xl font-bold mb-4 text-gray-900"
              style={{ fontFamily: 'Lora, Georgia, serif' }}
            >
              Check your email
            </h1>
            <div
              className="px-4 py-4 mb-6 rounded-sm"
              style={{ backgroundColor: '#F0FDF4', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <p className="text-gray-700 text-sm">
                We&apos;ve sent a confirmation link to <strong>{email}</strong>.
                Please click the link to verify your account.
                {organizationName && (
                  <>
                    {' '}After verification, you&apos;ll be added to{' '}
                    <strong>{organizationName}</strong>.
                  </>
                )}
              </p>
            </div>
            <Link href="/login" className="text-sm font-medium" style={{ color: '#2C4A6E' }}>
              Return to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      <LeftPanel />
      <div
        className="flex-1 flex items-center justify-center px-6 py-12"
        style={{ backgroundColor: '#FAFAF8' }}
      >
        <div className="w-full max-w-sm">
          <h1
            className="text-2xl font-bold mb-2 text-gray-900"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            Create account
          </h1>
          {organizationName ? (
            <p className="text-sm text-gray-500 mb-8">
              Join <strong>{organizationName}</strong> on Correspondence Clerk
            </p>
          ) : (
            <p className="text-sm text-gray-500 mb-8">
              14-day free trial, no credit card required
            </p>
          )}

          {error && (
            <div
              className="px-4 py-3 mb-6 rounded-sm"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid rgba(220,38,38,0.2)' }}
            >
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <Label htmlFor="email" className="block mb-2 font-semibold text-sm text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <Label htmlFor="password" className="block mb-2 font-semibold text-sm text-gray-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full"
                placeholder="Minimum 8 characters"
              />
              <p className="text-gray-400 text-xs mt-1">At least 8 characters</p>
            </div>

            <div>
              <Label
                htmlFor="confirmPassword"
                className="block mb-2 font-semibold text-sm text-gray-700"
              >
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full"
                placeholder="Re-enter password"
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                id="terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                disabled={isLoading}
                className="mt-1"
              />
              <label htmlFor="terms" className="text-sm text-gray-500">
                I agree to the{' '}
                <Link
                  href="/terms"
                  target="_blank"
                  className="font-medium"
                  style={{ color: '#2C4A6E' }}
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-medium"
                  style={{ color: '#2C4A6E' }}
                >
                  Privacy Policy
                </Link>
              </label>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full text-white font-semibold py-3"
              style={{ backgroundColor: '#2C4A6E' }}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium" style={{ color: '#2C4A6E' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex">
          <div className="hidden md:block md:w-2/5" style={{ backgroundColor: '#1E293B' }} />
          <div
            className="flex-1 flex items-center justify-center px-6"
            style={{ backgroundColor: '#FAFAF8' }}
          >
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  )
}

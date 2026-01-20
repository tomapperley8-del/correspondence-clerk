'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { validateInvitationToken } from '@/app/actions/invitations'

function SignupPageContent() {
  const searchParams = useSearchParams()
  const invitationToken = searchParams.get('invitation_token')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)
  const [organizationName, setOrganizationName] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Validate invitation token on mount
  useEffect(() => {
    async function checkInvitation() {
      if (invitationToken) {
        const result = await validateInvitationToken(invitationToken)
        if (result.error) {
          setError(result.error)
        } else if (result.data) {
          setInvitedEmail(result.data.email)
          setEmail(result.data.email)
          setOrganizationName(result.data.organizations?.name || null)
        }
      }
    }
    checkInvitation()
  }, [invitationToken])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // If invitation token exists, validate email matches
    if (invitedEmail && email.toLowerCase() !== invitedEmail.toLowerCase()) {
      setError(
        `You must sign up with the invited email address: ${invitedEmail}`
      )
      return
    }

    // Client-side validation
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    // Add invitation token to redirect URL if present
    const redirectUrl = invitationToken
      ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?invitation_token=${invitationToken}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
    } else {
      setSuccess(true)
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white border-2 border-green-600 p-8">
            <h1 className="text-2xl font-bold mb-4 text-gray-900">
              Check Your Email
            </h1>
            <p className="text-gray-700 mb-6">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
              Please check your email and click the link to verify your account.
              {organizationName && (
                <>
                  {' '}
                  After verification, you&apos;ll be added to{' '}
                  <strong>{organizationName}</strong>.
                </>
              )}
            </p>
            <Link
              href="/login"
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              Return to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border-2 border-gray-800 p-8">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">
            Create Account
          </h1>
          {organizationName && (
            <p className="text-gray-600 mb-6">
              Join <strong>{organizationName}</strong> on Correspondence Clerk
            </p>
          )}

          {error && (
            <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <Label htmlFor="email" className="block mb-2 font-semibold">
                Email <span className="text-red-600">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading || !!invitedEmail}
                className="w-full"
                placeholder="you@example.com"
              />
              {invitedEmail && (
                <p className="text-gray-500 text-xs mt-1">
                  Using invited email address
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="password" className="block mb-2 font-semibold">
                Password <span className="text-red-600">*</span>
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
              <p className="text-gray-500 text-xs mt-1">
                At least 8 characters
              </p>
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="block mb-2 font-semibold">
                Confirm Password <span className="text-red-600">*</span>
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

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-md">
            <div className="bg-white border-2 border-gray-800 p-8">
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        </div>
      }
    >
      <SignupPageContent />
    </Suspense>
  )
}

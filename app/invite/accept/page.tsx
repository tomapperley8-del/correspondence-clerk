'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { getInvitationByToken } from '@/app/actions/invitations'

type InvitationData = {
  id: string
  status: string
  expires_at: string
  organizations: {
    id: string
    name: string
  }
}

function AcceptInvitePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError('No invitation token provided')
        setIsLoading(false)
        return
      }

      const result = await getInvitationByToken(token)

      if (result.error || !result.data) {
        setError(result.error || 'Invalid invitation')
        setIsLoading(false)
        return
      }

      const inv = result.data

      // Check status
      if (inv.status !== 'pending') {
        setError('This invitation has already been used or cancelled')
        setIsLoading(false)
        return
      }

      // Check expiry
      const expiresAt = new Date(inv.expires_at)
      if (expiresAt < new Date()) {
        setError('This invitation has expired')
        setIsLoading(false)
        return
      }

      setInvitation(inv as InvitationData)
      setIsLoading(false)
    }

    validateToken()
  }, [token])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white border-2 border-gray-800 p-8">
            <p className="text-gray-600">Validating invitation...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white border-2 border-red-600 p-8">
            <h1 className="text-2xl font-bold mb-4 text-gray-900">
              Invalid Invitation
            </h1>
            <p className="text-gray-700 mb-6">{error}</p>
            <Link href="/login">
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                Go to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!invitation) {
    return null
  }

  const expiresAt = new Date(invitation.expires_at)
  const daysUntilExpiry = Math.ceil(
    (expiresAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border-2 border-gray-800 p-8">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">
            You&apos;re Invited!
          </h1>
          <p className="text-gray-600 mb-6">
            You&apos;ve been invited to join{' '}
            <strong>{invitation.organizations.name}</strong> on Correspondence
            Clerk.
          </p>

          <div className="border-2 border-gray-200 bg-gray-50 p-4 mb-6">
            <p className="text-sm text-gray-700 mb-2">
              <strong>Organization:</strong> {invitation.organizations.name}
            </p>
            <p className="text-sm text-gray-500">
              This invite expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="space-y-3">
            <Link href={`/signup?invitation_token=${token}`} className="block">
              <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold">
                Create Account
              </Button>
            </Link>

            <Link href={`/login?invitation_token=${token}`} className="block">
              <Button
                variant="outline"
                className="w-full border-2 border-gray-800 px-6 py-3 font-semibold"
              >
                Already have an account? Login
              </Button>
            </Link>
          </div>

          <p className="text-xs text-gray-500 mt-6">
            You can sign up with any email address to join the organization.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-md">
            <div className="bg-white border-2 border-gray-800 p-8">
              <p className="text-gray-600">Validating invitation...</p>
            </div>
          </div>
        </div>
      }
    >
      <AcceptInvitePageContent />
    </Suspense>
  )
}

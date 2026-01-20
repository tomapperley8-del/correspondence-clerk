'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getCurrentOrganization,
  updateOrganization,
  getOrganizationMembers,
} from '@/app/actions/organizations'
import {
  createInvitation,
  getInvitations,
  cancelInvitation,
} from '@/app/actions/invitations'
import { useRouter } from 'next/navigation'

type Organization = {
  id: string
  name: string
}

type Member = {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
}

type Invitation = {
  id: string
  email: string
  status: string
  created_at: string
  expires_at: string
}

export default function OrganizationSettingsPage() {
  const router = useRouter()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [isLoadingOrg, setIsLoadingOrg] = useState(true)
  const [isSavingName, setIsSavingName] = useState(false)
  const [isSendingInvite, setIsSendingInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoadingOrg(true)

    // Load organization
    const orgResult = await getCurrentOrganization()
    if (orgResult.error || !orgResult.data) {
      setError(orgResult.error || 'Failed to load organization')
      setIsLoadingOrg(false)
      return
    }

    setOrganization(orgResult.data)
    setOrganizationName(orgResult.data.name)

    // Load members
    const membersResult = await getOrganizationMembers()
    if (membersResult.data) {
      setMembers(membersResult.data)
    }

    // Load invitations
    const invitationsResult = await getInvitations()
    if (invitationsResult.data) {
      setInvitations(
        invitationsResult.data.filter((inv) => inv.status === 'pending')
      )
    }

    setIsLoadingOrg(false)
  }

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!organizationName.trim()) {
      setError('Organization name cannot be empty')
      return
    }

    setIsSavingName(true)
    const result = await updateOrganization(organizationName)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('Organization name updated successfully')
      setOrganization(result.data)
    }

    setIsSavingName(false)
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    setIsSendingInvite(true)
    const result = await createInvitation(inviteEmail)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      // Reload invitations
      const invitationsResult = await getInvitations()
      if (invitationsResult.data) {
        setInvitations(
          invitationsResult.data.filter((inv) => inv.status === 'pending')
        )
      }
    }

    setIsSendingInvite(false)
  }

  async function handleCancelInvite(invitationId: string) {
    setError(null)
    setSuccess(null)

    const result = await cancelInvitation(invitationId)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('Invitation cancelled')
      // Reload invitations
      const invitationsResult = await getInvitations()
      if (invitationsResult.data) {
        setInvitations(
          invitationsResult.data.filter((inv) => inv.status === 'pending')
        )
      }
    }
  }

  function copyInvitationLink(token: string) {
    const baseUrl = window.location.origin
    const inviteUrl = `${baseUrl}/invite/accept?token=${token}`
    navigator.clipboard.writeText(inviteUrl)
    setSuccess('Invitation link copied to clipboard')
    setTimeout(() => setSuccess(null), 3000)
  }

  if (isLoadingOrg) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-600">Loading organization settings...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-gray-900">
        Organization Settings
      </h1>

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

      {/* Organization Name */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">
          Organization Name
        </h2>
        <form onSubmit={handleUpdateName} className="space-y-4">
          <div>
            <Label htmlFor="orgName" className="block mb-2 font-semibold">
              Name
            </Label>
            <Input
              id="orgName"
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              disabled={isSavingName}
              className="w-full"
            />
          </div>
          <Button
            type="submit"
            disabled={isSavingName || organizationName === organization?.name}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {isSavingName ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* Team Members */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Team Members</h2>
        {members.length === 0 ? (
          <p className="text-gray-600">No team members found.</p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="border-2 border-gray-200 p-3 flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {member.email || 'No email'}
                  </p>
                  {member.display_name && member.display_name !== member.email && (
                    <p className="text-sm text-gray-600">{member.display_name}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Joined {new Date(member.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Team Members */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">
          Invite Team Members
        </h2>
        <form onSubmit={handleSendInvite} className="space-y-4">
          <div>
            <Label htmlFor="inviteEmail" className="block mb-2 font-semibold">
              Email Address
            </Label>
            <div className="flex gap-2">
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={isSendingInvite}
                className="flex-1"
                placeholder="colleague@example.com"
              />
              <Button
                type="submit"
                disabled={isSendingInvite}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {isSendingInvite ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>
          </div>
        </form>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold mb-3 text-gray-900">Pending Invitations</h3>
            <div className="space-y-2">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="border-2 border-gray-200 p-3 flex justify-between items-center"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {invitation.email}
                    </p>
                    <p className="text-xs text-gray-500">
                      Sent {new Date(invitation.created_at).toLocaleDateString()}
                      {' · '}
                      Expires{' '}
                      {new Date(invitation.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelInvite(invitation.id)}
                      className="text-sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Back to Dashboard */}
      <Button
        variant="outline"
        onClick={() => router.push('/dashboard')}
        className="border-2 border-gray-800"
      >
        Back to Dashboard
      </Button>
    </div>
  )
}

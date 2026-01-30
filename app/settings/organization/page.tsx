'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
import { formatDateGB } from '@/lib/utils'

type Organization = {
  id: string
  name: string
}

type Member = {
  id: string
  email: string | null
  display_name: string | null
  role: 'admin' | 'member'
  created_at: string
}

type Invitation = {
  id: string
  email: string
  status: string
  created_at: string
  expires_at: string
  token: string
  accepted_email?: string | null
}

export default function OrganizationSettingsPage() {
  const router = useRouter()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoadingOrg, setIsLoadingOrg] = useState(true)
  const [isSavingName, setIsSavingName] = useState(false)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
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

  async function handleGenerateLink() {
    setError(null)
    setSuccess(null)
    setGeneratedLink(null)
    setLinkCopied(false)

    setIsGeneratingLink(true)
    const result = await createInvitation()

    if (result.error) {
      setError(result.error)
    } else if (result.inviteUrl) {
      setGeneratedLink(result.inviteUrl)
      setSuccess('Invite link generated. Copy and share it with your team member.')
      // Reload invitations
      const invitationsResult = await getInvitations()
      if (invitationsResult.data) {
        setInvitations(
          invitationsResult.data.filter((inv) => inv.status === 'pending')
        )
      }
    }

    setIsGeneratingLink(false)
  }

  async function handleCopyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      setError('Failed to copy link to clipboard')
    }
  }

  function getInviteUrl(invitation: Invitation): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return `${appUrl}/invite/accept?token=${invitation.token}`
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

  if (isLoadingOrg) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-600">Loading organization settings...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">
        Organization Settings
      </h1>
      <p className="text-gray-600 mb-8">
        Manage your organization and team members.
      </p>

      {/* Navigation to other settings pages */}
      <div className="flex gap-2 mb-6 pb-6 border-b-2 border-gray-300">
        <Link
          href="/settings"
          className="px-4 py-2 bg-white text-gray-700 font-semibold border-2 border-gray-300 hover:border-blue-600"
        >
          User Profile
        </Link>
        <Link
          href="/settings/organization"
          className="px-4 py-2 bg-blue-600 text-white font-semibold border-2 border-blue-600"
        >
          Organization
        </Link>
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
        <p className="text-sm text-gray-600 mb-4">
          <strong>Admin:</strong> Can import data and manage settings.{' '}
          <strong>Member:</strong> Can add and edit correspondence.
        </p>
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
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      {member.email || 'No email'}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 font-semibold ${
                        member.role === 'admin'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-gray-100 text-gray-700 border border-gray-300'
                      }`}
                    >
                      {member.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                  </div>
                  {member.display_name && member.display_name !== member.email && (
                    <p className="text-sm text-gray-600">{member.display_name}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Joined {formatDateGB(member.created_at)}
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
        <p className="text-sm text-gray-600 mb-4">
          Generate a shareable invite link and send it to your team member via email, Slack, or any other channel.
        </p>

        <Button
          onClick={handleGenerateLink}
          disabled={isGeneratingLink}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {isGeneratingLink ? 'Generating...' : 'Generate Invite Link'}
        </Button>

        {/* Generated Link Display */}
        {generatedLink && (
          <div className="mt-4 border-2 border-green-600 bg-green-50 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">
              Invite Link (expires in 7 days):
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                value={generatedLink}
                readOnly
                className="flex-1 text-sm bg-white"
              />
              <Button
                onClick={() => handleCopyLink(generatedLink)}
                variant="outline"
                className="border-2 border-gray-800"
              >
                {linkCopied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Share this link with your team member. They can sign up with any email address.
            </p>
          </div>
        )}

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold mb-3 text-gray-900">Pending Invite Links</h3>
            <div className="space-y-2">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="border-2 border-gray-200 p-3"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-gray-500">
                        Created {formatDateGB(invitation.created_at)}
                        {' · '}
                        Expires {formatDateGB(invitation.expires_at)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelInvite(invitation.id)}
                      className="text-sm"
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={getInviteUrl(invitation)}
                      readOnly
                      className="flex-1 text-xs bg-gray-50"
                    />
                    <Button
                      onClick={() => handleCopyLink(getInviteUrl(invitation))}
                      variant="outline"
                      size="sm"
                      className="text-sm"
                    >
                      Copy
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

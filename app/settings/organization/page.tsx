'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getCurrentOrganization,
  updateOrganization,
  updateOrganizationProfile,
  getOrganizationMembers,
  type Organization,
} from '@/app/actions/organizations'
import {
  createInvitation,
  getInvitations,
  cancelInvitation,
} from '@/app/actions/invitations'
import {
  getMembershipTypes,
  createMembershipType,
  updateMembershipTypeOrder,
  toggleMembershipTypeActive,
  deleteMembershipType,
  type MembershipType,
} from '@/app/actions/membership-types'
import { useRouter } from 'next/navigation'
import { formatDateGB } from '@/lib/utils'
import {
  getUserPresets,
  createUserPreset,
  updateUserPreset,
  deleteUserPreset,
  type UserAIPreset,
} from '@/app/actions/insights'


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

function OrganizationSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isWelcome = searchParams.get('welcome') === 'true'
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [valueProposition, setValueProposition] = useState('')
  const [idealCustomerProfile, setIdealCustomerProfile] = useState('')
  const [servicesOffered, setServicesOffered] = useState('')
  const [typicalDealValue, setTypicalDealValue] = useState('')
  const [emailWritingStyle, setEmailWritingStyle] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([])
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [isAddingType, setIsAddingType] = useState(false)
  const [typeActionError, setTypeActionError] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoadingOrg, setIsLoadingOrg] = useState(true)
  const [isSavingName, setIsSavingName] = useState(false)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [presets, setPresets] = useState<UserAIPreset[]>([])
  const [newPresetLabel, setNewPresetLabel] = useState('')
  const [newPresetPrompt, setNewPresetPrompt] = useState('')
  const [newPresetScope, setNewPresetScope] = useState<'org' | 'business'>('org')
  const [isAddingPreset, setIsAddingPreset] = useState(false)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editPresetLabel, setEditPresetLabel] = useState('')
  const [editPresetPrompt, setEditPresetPrompt] = useState('')

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
    setBusinessDescription(orgResult.data.business_description ?? '')
    setIndustry(orgResult.data.industry ?? '')
    setValueProposition(orgResult.data.value_proposition ?? '')
    setIdealCustomerProfile(orgResult.data.ideal_customer_profile ?? '')
    setServicesOffered(orgResult.data.services_offered ?? '')
    setTypicalDealValue(orgResult.data.typical_deal_value ?? '')
    setEmailWritingStyle(orgResult.data.email_writing_style ?? '')

    // Load membership types
    const typesResult = await getMembershipTypes()
    if (typesResult.data) setMembershipTypes(typesResult.data)

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

    // Load AI presets
    const presetsResult = await getUserPresets()
    if (presetsResult.data) setPresets(presetsResult.data)

    setIsLoadingOrg(false)
  }

  async function handleAddPreset(e: React.FormEvent) {
    e.preventDefault()
    if (!newPresetLabel.trim() || !newPresetPrompt.trim()) return
    setIsAddingPreset(true)
    const result = await createUserPreset(newPresetLabel, newPresetPrompt, newPresetScope)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setPresets((prev) => [...prev, result.data!])
      setNewPresetLabel('')
      setNewPresetPrompt('')
      setNewPresetScope('org')
    }
    setIsAddingPreset(false)
  }

  async function handleSavePreset(id: string) {
    if (!editPresetLabel.trim() || !editPresetPrompt.trim()) return
    const result = await updateUserPreset(id, editPresetLabel, editPresetPrompt)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setPresets((prev) => prev.map((p) => (p.id === id ? result.data! : p)))
      setEditingPresetId(null)
    }
  }

  async function handleDeletePreset(id: string) {
    const result = await deleteUserPreset(id)
    if (result.error) {
      setError(result.error)
    } else {
      setPresets((prev) => prev.filter((p) => p.id !== id))
    }
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

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    setIsSavingProfile(true)
    const result = await updateOrganizationProfile({
      description: businessDescription,
      industry,
      value_proposition: valueProposition,
      ideal_customer_profile: idealCustomerProfile,
      services_offered: servicesOffered,
      typical_deal_value: typicalDealValue,
      email_writing_style: emailWritingStyle,
    })

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('Business profile saved')
      setProfileSaved(true)
    }

    setIsSavingProfile(false)
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

  async function handleAddMembershipType(e: React.FormEvent) {
    e.preventDefault()
    setTypeActionError(null)
    if (!newTypeLabel.trim()) return
    setIsAddingType(true)
    const result = await createMembershipType(newTypeLabel)
    if (result.error) {
      setTypeActionError(result.error)
    } else {
      setNewTypeLabel('')
      const typesResult = await getMembershipTypes()
      if (typesResult.data) setMembershipTypes(typesResult.data)
    }
    setIsAddingType(false)
  }

  async function handleMoveType(id: string, direction: 'up' | 'down') {
    setTypeActionError(null)
    const result = await updateMembershipTypeOrder(id, direction)
    if (result.error) {
      setTypeActionError(result.error)
    } else {
      const typesResult = await getMembershipTypes()
      if (typesResult.data) setMembershipTypes(typesResult.data)
    }
  }

  async function handleToggleType(id: string) {
    setTypeActionError(null)
    const result = await toggleMembershipTypeActive(id)
    if (result.error) {
      setTypeActionError(result.error)
    } else {
      const typesResult = await getMembershipTypes()
      if (typesResult.data) setMembershipTypes(typesResult.data)
    }
  }

  async function handleDeleteType(id: string) {
    setTypeActionError(null)
    const result = await deleteMembershipType(id)
    if (result.error) {
      setTypeActionError(result.error)
    } else {
      const typesResult = await getMembershipTypes()
      if (typesResult.data) setMembershipTypes(typesResult.data)
    }
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
      <div className="flex gap-1 mb-8 pb-6 border-b-2 border-gray-300 flex-wrap">
        <Link href="/settings" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Profile</Link>
        <Link href="/settings?tab=email" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Email</Link>
        <Link href="/settings/organization" className="px-4 py-2 font-semibold bg-brand-navy text-white border border-brand-navy">Organisation</Link>
        <Link href="/settings?tab=tools" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Tools</Link>
        <Link href="/settings/billing" className="px-4 py-2 font-semibold bg-white text-gray-700 border border-gray-200 hover:border-brand-navy transition-colors">Billing</Link>
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

      {/* Welcome banner — only for new users who haven't saved their profile yet */}
      {isWelcome && !profileSaved && (
        <div className="border-2 border-brand-navy bg-blue-50 px-4 py-3 mb-6">
          <p className="text-brand-dark font-semibold">Welcome to Correspondence Clerk!</p>
          <p className="text-brand-dark text-sm mt-1">
            Tell us about your business so your assistant knows who it&apos;s working for.
          </p>
        </div>
      )}

      {/* AI Context Profile */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-1 text-gray-900">AI Context</h2>
        <p className="text-sm text-gray-500 mb-4">
          The more you fill in here, the smarter your Insights become. Used across Briefings, Call Prep, Outreach Drafts, and more.
        </p>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <Label htmlFor="businessDescription" className="block mb-2 font-semibold text-sm">
              What does your business do?
            </Label>
            <textarea
              id="businessDescription"
              rows={3}
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              disabled={isSavingProfile}
              placeholder="e.g. We're a small agency managing client accounts and correspondence across a range of industries."
              className="w-full border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-navy rounded-sm"
            />
          </div>
          <div>
            <Label htmlFor="industry" className="block mb-2 font-semibold text-sm">
              Industry
            </Label>
            <Input
              id="industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              disabled={isSavingProfile}
              placeholder="e.g. Media, Accountancy, Consultancy"
              className="w-full"
            />
          </div>
          <div>
            <Label htmlFor="valueProposition" className="block mb-1 font-semibold text-sm">
              Your value proposition <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <p className="text-xs text-gray-400 mb-2">Used in Prospecting Targets and Outreach Draft insights.</p>
            <textarea
              id="valueProposition"
              rows={2}
              value={valueProposition}
              onChange={(e) => setValueProposition(e.target.value)}
              disabled={isSavingProfile}
              placeholder="e.g. We help independent retailers increase repeat custom through loyalty programmes."
              className="w-full border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-navy rounded-sm"
            />
          </div>
          <div>
            <Label htmlFor="idealCustomerProfile" className="block mb-1 font-semibold text-sm">
              Who is your ideal customer? <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <p className="text-xs text-gray-400 mb-2">Used in Prospecting Targets.</p>
            <textarea
              id="idealCustomerProfile"
              rows={2}
              value={idealCustomerProfile}
              onChange={(e) => setIdealCustomerProfile(e.target.value)}
              disabled={isSavingProfile}
              placeholder="e.g. Owner-managed businesses with 5–50 staff, typically in retail or hospitality."
              className="w-full border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-navy rounded-sm"
            />
          </div>
          <div>
            <Label htmlFor="servicesOffered" className="block mb-1 font-semibold text-sm">
              Products / services <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <p className="text-xs text-gray-400 mb-2">Used in Call Prep and Outreach Draft insights.</p>
            <textarea
              id="servicesOffered"
              rows={2}
              value={servicesOffered}
              onChange={(e) => setServicesOffered(e.target.value)}
              disabled={isSavingProfile}
              placeholder="e.g. Full membership, associate membership, event sponsorship, directory listings."
              className="w-full border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-navy rounded-sm"
            />
          </div>
          <div>
            <Label htmlFor="typicalDealValue" className="block mb-1 font-semibold text-sm">
              Typical deal / contract value <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <p className="text-xs text-gray-400 mb-2">Helps the AI prioritise high-value opportunities.</p>
            <Input
              id="typicalDealValue"
              type="text"
              value={typicalDealValue}
              onChange={(e) => setTypicalDealValue(e.target.value)}
              disabled={isSavingProfile}
              placeholder="e.g. £1,200/year membership, occasional £5k–£20k sponsorship deals"
              className="w-full"
            />
          </div>
          <div>
            <Label htmlFor="emailWritingStyle" className="block mb-1 font-semibold text-sm">
              How do you write emails? <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <p className="text-xs text-gray-400 mb-2">Used in Outreach Draft — ensures generated emails sound like you.</p>
            <textarea
              id="emailWritingStyle"
              rows={2}
              value={emailWritingStyle}
              onChange={(e) => setEmailWritingStyle(e.target.value)}
              disabled={isSavingProfile}
              placeholder="e.g. Friendly but professional. Short paragraphs. Never start with 'I hope this finds you well'."
              className="w-full border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-navy rounded-sm"
            />
          </div>
          <Button
            type="submit"
            disabled={isSavingProfile}
            className="bg-brand-navy hover:bg-brand-navy-hover text-white"
          >
            {isSavingProfile ? 'Saving...' : 'Save AI Context'}
          </Button>
        </form>
      </div>

      {/* Membership Types */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-1 text-gray-900">Membership Types</h2>
        <p className="text-sm text-gray-500 mb-4">Define the membership categories used for businesses in your organisation.</p>

        {typeActionError && (
          <div className="border-2 border-red-600 bg-red-50 px-3 py-2 mb-4">
            <p className="text-red-800 text-sm">{typeActionError}</p>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {membershipTypes.map((t, idx) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 border-2 border-gray-200 px-3 py-2 ${!t.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm text-gray-900">{t.label}</span>
                <span className="ml-2 text-xs text-gray-400">{t.value}</span>
                {!t.is_active && <span className="ml-2 text-xs text-gray-400">(Inactive)</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleMoveType(t.id, 'up')}
                  disabled={idx === 0}
                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-30"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveType(t.id, 'down')}
                  disabled={idx === membershipTypes.length - 1}
                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-30"
                  title="Move down"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleType(t.id)}
                  className={`px-2 py-1 text-xs font-semibold border-2 ${t.is_active ? 'border-gray-300 text-gray-700 hover:border-gray-500' : 'border-green-600 text-green-700 hover:bg-green-50'}`}
                >
                  {t.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteType(t.id)}
                  className="px-2 py-1 text-xs font-semibold border-2 border-red-300 text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {membershipTypes.length === 0 && (
            <p className="text-sm text-gray-500">No membership types defined yet.</p>
          )}
        </div>

        <form onSubmit={handleAddMembershipType} className="flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="newTypeLabel" className="block mb-1 text-sm font-semibold">
              Add new type
            </Label>
            <Input
              id="newTypeLabel"
              type="text"
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              placeholder="e.g. Partner, Sponsor"
              disabled={isAddingType}
              className="w-full"
            />
            {newTypeLabel.trim() && (
              <p className="text-xs text-gray-400 mt-1">
                Value: {newTypeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={isAddingType || !newTypeLabel.trim()}
            className="bg-brand-navy text-white hover:bg-brand-navy-hover shrink-0"
          >
            {isAddingType ? 'Adding...' : 'Add Type'}
          </Button>
        </form>
      </div>

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
            className="bg-brand-navy text-white hover:bg-brand-navy-hover"
          >
            {isSavingName ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* AI Presets */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-1 text-gray-900">Custom Insights</h2>
        <p className="text-sm text-gray-500 mb-4">
          Add your own insight prompts — they appear in the Insights panel alongside the defaults. Max 5.
        </p>

        {presets.length > 0 && (
          <div className="space-y-3 mb-6">
            {presets.map((preset) => (
              <div key={preset.id} className="border border-gray-200 rounded-sm p-3">
                {editingPresetId === preset.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editPresetLabel}
                      onChange={(e) => setEditPresetLabel(e.target.value)}
                      placeholder="Label"
                      className="text-sm"
                    />
                    <textarea
                      value={editPresetPrompt}
                      onChange={(e) => setEditPresetPrompt(e.target.value)}
                      rows={3}
                      placeholder="Prompt text"
                      className="w-full border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-navy rounded-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSavePreset(preset.id)} className="bg-brand-navy text-white hover:bg-brand-navy-hover text-xs">Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPresetId(null)} className="text-xs">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">{preset.label}</span>
                        <span className="text-xs text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded">{preset.scope}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{preset.prompt_text}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingPresetId(preset.id); setEditPresetLabel(preset.label); setEditPresetPrompt(preset.prompt_text) }}
                        className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {presets.length < 5 && (
          <form onSubmit={handleAddPreset} className="space-y-3 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-700">Add a custom insight</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="newPresetLabel" className="text-xs text-gray-600 mb-1 block">Label</Label>
                <Input
                  id="newPresetLabel"
                  value={newPresetLabel}
                  onChange={(e) => setNewPresetLabel(e.target.value)}
                  placeholder="e.g. Renewal Prep"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Scope</Label>
                <select
                  value={newPresetScope}
                  onChange={(e) => setNewPresetScope(e.target.value as 'org' | 'business')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-sm bg-white focus:outline-none focus:border-brand-navy"
                >
                  <option value="org">Org-wide</option>
                  <option value="business">Business-specific</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="newPresetPrompt" className="text-xs text-gray-600 mb-1 block">What should this insight do?</Label>
              <textarea
                id="newPresetPrompt"
                rows={3}
                value={newPresetPrompt}
                onChange={(e) => setNewPresetPrompt(e.target.value)}
                placeholder="e.g. Review all businesses with contracts expiring in the next 90 days and draft a renewal talking points list for each."
                className="w-full border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand-navy rounded-sm"
              />
            </div>
            <Button type="submit" disabled={isAddingPreset || !newPresetLabel.trim() || !newPresetPrompt.trim()} className="bg-brand-navy hover:bg-brand-navy-hover text-white text-sm">
              {isAddingPreset ? 'Adding…' : 'Add Insight'}
            </Button>
          </form>
        )}

        {presets.length >= 5 && (
          <p className="text-xs text-gray-400">Maximum of 5 custom insights reached.</p>
        )}
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
          className="bg-brand-navy text-white hover:bg-brand-navy-hover"
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

export default function OrganizationSettingsPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><p className="text-gray-600">Loading organization settings...</p></div>}>
      <OrganizationSettingsContent />
    </Suspense>
  )
}

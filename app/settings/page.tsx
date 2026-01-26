'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getUserProfile, updateDisplayName, type UserProfile } from '@/app/actions/user-profile'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [userEmail, setUserEmail] = useState<string>('')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    setIsLoading(true)

    // Get user email from auth
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      setUserEmail(user.email || '')
    }

    // Get user profile
    const result = await getUserProfile()

    if (result.error || !result.data) {
      setError(result.error || 'Failed to load profile')
      setIsLoading(false)
      return
    }

    setProfile(result.data)
    setDisplayName(result.data.display_name || '')

    setIsLoading(false)
  }

  async function handleSaveDisplayName(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!displayName.trim()) {
      setError('Display name cannot be empty')
      return
    }

    if (displayName.length > 100) {
      setError('Display name must be 100 characters or less')
      return
    }

    setIsSaving(true)
    const result = await updateDisplayName(displayName.trim())

    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setSuccess('Display name updated successfully')
      setProfile(result.data)
    }

    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-gray-600">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2 text-gray-900">User Settings</h1>
      <p className="text-gray-600 mb-8">
        Manage your personal profile and preferences.
      </p>

      {/* Navigation to other settings pages */}
      <div className="flex gap-2 mb-6 pb-6 border-b-2 border-gray-300">
        <Link
          href="/settings"
          className="px-4 py-2 bg-blue-600 text-white font-semibold border-2 border-blue-600"
        >
          User Profile
        </Link>
        <Link
          href="/settings/organization"
          className="px-4 py-2 bg-white text-gray-700 font-semibold border-2 border-gray-300 hover:border-blue-600"
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

      {/* User Email (Read-only) */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Email Address</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your email address is managed by your authentication provider and cannot
          be changed here.
        </p>
        <div>
          <Label htmlFor="email" className="block mb-2 font-semibold">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={userEmail}
            disabled
            className="w-full bg-gray-100"
          />
        </div>
      </div>

      {/* Display Name */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Display Name</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your display name is shown to other users and on correspondence entries
          you create. If not set, we will use the first part of your email
          address.
        </p>
        <form onSubmit={handleSaveDisplayName} className="space-y-4">
          <div>
            <Label htmlFor="displayName" className="block mb-2 font-semibold">
              Display Name
            </Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isSaving}
              className="w-full"
              placeholder={
                userEmail ? userEmail.split('@')[0] : 'Your display name'
              }
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-2">
              {displayName.length}/100 characters
            </p>
          </div>
          <Button
            type="submit"
            disabled={isSaving || displayName === (profile?.display_name || '')}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {isSaving ? 'Saving...' : 'Save Display Name'}
          </Button>
        </form>
      </div>

      {/* Future: Profile Picture */}
      <div className="bg-gray-100 border-2 border-gray-300 p-6 mb-6">
        <h2 className="text-xl font-bold mb-2 text-gray-600">
          Profile Picture (Coming Soon)
        </h2>
        <p className="text-sm text-gray-600">
          Profile picture upload will be available in a future update.
        </p>
      </div>

      {/* Tools Section */}
      <div className="bg-white border-2 border-gray-800 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Tools</h2>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">
                Outlook Email Import Tool
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Install a bookmarklet to import emails directly from Outlook Web
                with one click.
              </p>
            </div>
            <Link
              href="/bookmarklet"
              className="shrink-0 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 border-2 border-blue-600"
            >
              Install
            </Link>
          </div>
        </div>
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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getUserProfile, updateDisplayName, deleteAccount, type UserProfile } from '@/app/actions/user-profile'
import { getInboundEmailToken } from '@/app/actions/inbound-email'
import { getUnformattedCount, formatAllUnformatted } from '@/app/actions/ai-formatter'
import { toast } from '@/lib/toast'
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
  const [inboundToken, setInboundToken] = useState<string | null>(null)
  const [lastEmailReceived, setLastEmailReceived] = useState<string | null>(null)
  const [sendingTest, setSendingTest] = useState(false)
  const [unformattedCount, setUnformattedCount] = useState<number>(0)
  const [isFormatting, setIsFormatting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

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

    // Load inbound email token
    const tokenResult = await getInboundEmailToken()
    if (tokenResult.data) {
      setInboundToken(tokenResult.data.token)
      setLastEmailReceived(tokenResult.data.lastReceivedAt)
    }

    // Load unformatted count
    const countResult = await getUnformattedCount()
    if (countResult.data !== undefined) {
      setUnformattedCount(countResult.data)
    }

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

  async function handleSendTest() {
    setSendingTest(true)
    try {
      const res = await fetch('/api/inbound-email/send-test', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        toast.error(`Could not send test email: ${data.error}`)
      } else {
        toast.success('Test email sent — check your Inbox queue in a moment')
      }
    } catch {
      toast.error('Failed to send test email')
    }
    setSendingTest(false)
  }

  function handleExport(type: string) {
    window.location.href = `/api/export?type=${type}`
  }

  async function handleDeleteAccount() {
    setIsDeleting(true)
    const result = await deleteAccount()
    if (result.error) {
      toast.error(`Could not delete account: ${result.error}`)
      setIsDeleting(false)
    } else {
      await supabase.auth.signOut()
      window.location.href = '/login?message=account-deleted'
    }
  }

  async function handleFormatAll() {
    setIsFormatting(true)
    const result = await formatAllUnformatted()
    if (result.error) {
      toast.error(`Formatting failed: ${result.error}`)
    } else if (result.data) {
      const { formatted, total } = result.data
      toast.success(`Formatted ${formatted} of ${total} entries`)
      setUnformattedCount(prev => Math.max(0, prev - formatted))
    }
    setIsFormatting(false)
  }

  function formatLastReceived(iso: string): string {
    const d = new Date(iso)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
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
          className="px-4 py-2 bg-brand-navy text-white font-semibold border border-brand-navy"
        >
          User Profile
        </Link>
        <Link
          href="/settings/organization"
          className="px-4 py-2 bg-white text-gray-700 font-semibold border border-gray-200 hover:border-brand-navy"
        >
          Organization
        </Link>
        <Link
          href="/settings/billing"
          className="px-4 py-2 bg-white text-gray-700 font-semibold border border-gray-200 hover:border-brand-navy"
        >
          Billing
        </Link>
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="border border-green-400 bg-green-50 px-4 py-3 mb-6">
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

      {/* User Email (Read-only) */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Email Address</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your email address is managed by your authentication provider and cannot
          be changed here.
        </p>
        <div>
          <p className="block mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Email address (cannot be changed)
          </p>
          <p className="text-sm text-brand-dark py-2">{userEmail}</p>
        </div>
      </div>

      {/* Display Name */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
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
            className="bg-brand-navy text-white hover:bg-brand-navy-hover"
          >
            {isSaving ? 'Saving...' : 'Save Display Name'}
          </Button>
        </form>
      </div>

      {/* Email Forwarding */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold mb-2 text-gray-900">Email Forwarding</h2>
        <p className="text-sm text-gray-600 mb-5">
          One address handles both directions. Forward received emails to it, or BCC it on emails you send.
          Either way they auto-file once a domain is recognised — or land in your{' '}
          <Link href="/inbox" className="underline" style={{ color: 'var(--brand-navy)' }}>Inbox</Link>{' '}
          for manual filing.
        </p>

        {inboundToken ? (
          <>
            {/* Address display + copy */}
            <div className="flex items-center gap-2 mb-5">
              <code
                className="flex-1 text-sm px-3 py-2 rounded bg-gray-50 border border-gray-200 select-all"
                style={{ fontFamily: 'monospace', color: 'var(--brand-dark)' }}
              >
                {inboundToken}@in.correspondenceclerk.com
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${inboundToken}@in.correspondenceclerk.com`)
                  toast.success('Address copied')
                }}
                className="px-3 py-2 text-sm font-medium rounded border border-gray-300 hover:border-gray-500 transition-colors whitespace-nowrap"
                style={{ color: 'var(--brand-dark)' }}
              >
                Copy
              </button>
            </div>

            {/* Setup instructions */}
            <div className="space-y-3 mb-5">
              <details className="border border-gray-200 rounded">
                <summary
                  className="px-4 py-3 text-sm font-semibold cursor-pointer select-none"
                  style={{ color: 'var(--brand-dark)' }}
                >
                  Capturing received emails (forwarding rule)
                </summary>
                <div className="px-4 pb-4 pt-2 space-y-4 text-sm text-gray-700">
                  <p>Set up a forwarding rule in your email client so incoming emails are automatically forwarded to your address above. They&rsquo;ll be filed as <strong>received</strong>.</p>
                  <div>
                    <p className="font-semibold mb-1">Gmail</p>
                    <ol className="space-y-1 list-decimal list-inside">
                      <li>Settings (gear icon) &rarr; <strong>See all settings</strong> &rarr; <strong>Forwarding and POP/IMAP</strong></li>
                      <li>Add a forwarding address and confirm the verification email</li>
                      <li>Optional: use <strong>Filters</strong> to forward only emails from specific senders or domains</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Outlook</p>
                    <ol className="space-y-1 list-decimal list-inside">
                      <li>Settings (gear icon) &rarr; <strong>Mail</strong> &rarr; <strong>Forwarding</strong></li>
                      <li>Toggle <strong>Enable forwarding</strong> on and paste your address</li>
                      <li>Alternative: use <strong>Rules</strong> to forward only from specific contacts</li>
                    </ol>
                  </div>
                </div>
              </details>

              <details className="border border-gray-200 rounded">
                <summary
                  className="px-4 py-3 text-sm font-semibold cursor-pointer select-none"
                  style={{ color: 'var(--brand-dark)' }}
                >
                  Capturing sent emails (BCC)
                </summary>
                <div className="px-4 pb-4 pt-2 space-y-3 text-sm text-gray-700">
                  <p>
                    When sending an email, add your address to the <strong>BCC</strong> field.
                    The system detects it was a sent email and files it as <strong>sent</strong>, matching the business from the recipients rather than the sender.
                  </p>
                  <p>
                    Most email clients let you set a default BCC address so this happens automatically on every email you send.
                  </p>
                  <div>
                    <p className="font-semibold mb-1">Gmail — always BCC yourself</p>
                    <ol className="space-y-1 list-decimal list-inside">
                      <li>Install the <strong>Boomerang</strong> or <strong>Mixmax</strong> extension, which both support a default BCC</li>
                      <li>Or use a Gmail filter with &ldquo;from:me&rdquo; to forward sent mail to your address</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Outlook — always BCC yourself</p>
                    <ol className="space-y-1 list-decimal list-inside">
                      <li>File &rarr; Options &rarr; <strong>Mail</strong> &rarr; <strong>Send messages</strong></li>
                      <li>Tick <strong>Automatically Bcc</strong> and paste your address</li>
                    </ol>
                  </div>
                </div>
              </details>
            </div>

            {/* Test + status */}
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleSendTest}
                disabled={sendingTest}
                className="px-4 py-2 text-sm font-medium text-white rounded transition-colors"
                style={{
                  backgroundColor: sendingTest ? 'rgba(0,0,0,0.2)' : 'var(--brand-navy)',
                  cursor: sendingTest ? 'not-allowed' : 'pointer',
                }}
              >
                {sendingTest ? 'Sending…' : 'Send test email'}
              </button>
              <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
                {lastEmailReceived
                  ? `Last email received: ${formatLastReceived(lastEmailReceived)}`
                  : 'No emails received yet'}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">Loading your inbound address…</p>
        )}
      </div>

      {/* Data Health — only shown when there are unformatted entries */}
      {unformattedCount > 0 && (
        <div className="bg-white border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold mb-2 text-gray-900">Data Health</h2>
          <p className="text-sm text-gray-600 mb-4">
            {unformattedCount} {unformattedCount === 1 ? 'entry' : 'entries'} saved without AI formatting. Format them now to improve readability.
          </p>
          <button
            onClick={handleFormatAll}
            disabled={isFormatting}
            className="px-4 py-2 text-sm font-semibold text-white transition-colors"
            style={{
              backgroundColor: isFormatting ? 'rgba(0,0,0,0.2)' : 'var(--brand-navy)',
              cursor: isFormatting ? 'not-allowed' : 'pointer',
            }}
          >
            {isFormatting ? 'Formatting…' : `Format all ${unformattedCount} entries`}
          </button>
        </div>
      )}

      {/* Tools Section */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Tools</h2>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">
                Email Import Tool
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Install a bookmarklet to import emails directly from Outlook Web
                or Gmail with one click.
              </p>
            </div>
            <Link
              href="/bookmarklet"
              className="shrink-0 px-4 py-2 bg-brand-navy text-white font-semibold hover:bg-brand-navy-hover"
            >
              Install
            </Link>
          </div>
        </div>
      </div>

      {/* Data Export */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold mb-2 text-gray-900">Export Your Data</h2>
        <p className="text-sm text-gray-600 mb-5">
          Download your data as CSV files. Each file contains all records for your organisation.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport('businesses')}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 hover:border-brand-navy transition-colors"
            style={{ color: 'var(--brand-dark)' }}
          >
            Download Businesses
          </button>
          <button
            onClick={() => handleExport('contacts')}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 hover:border-brand-navy transition-colors"
            style={{ color: 'var(--brand-dark)' }}
          >
            Download Contacts
          </button>
          <button
            onClick={() => handleExport('correspondence')}
            className="px-4 py-2 text-sm font-semibold border border-gray-300 hover:border-brand-navy transition-colors"
            style={{ color: 'var(--brand-dark)' }}
          >
            Download Correspondence
          </button>
        </div>
      </div>

      {/* Account Deletion */}
      <div className="bg-white border border-red-200 p-6 mb-6">
        <h2 className="text-xl font-bold mb-2 text-red-800">Delete Account</h2>
        <p className="text-sm text-gray-600 mb-4">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-sm font-semibold border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-red-700">
              Type <span className="font-mono">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              className="block w-full max-w-xs px-3 py-2 border border-red-300 text-sm focus:outline-none focus:border-red-500"
              placeholder="DELETE"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isDeleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                className="px-4 py-2 text-sm font-semibold border border-gray-300 hover:border-gray-500 transition-colors"
                style={{ color: 'var(--brand-dark)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Back to Dashboard */}
      <Button
        variant="outline"
        onClick={() => router.push('/dashboard')}
        className="border border-gray-200"
      >
        Back to Dashboard
      </Button>
    </div>
  )
}

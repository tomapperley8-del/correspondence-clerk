'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { getUserProfile, updateDisplayName, updateBriefingEmailOptOut, deleteAccount, type UserProfile } from '@/app/actions/user-profile'
import { getInboundEmailToken, getOwnEmailAddresses, updateOwnEmailAddresses, getBlockedSenders, unblockSender } from '@/app/actions/inbound-email'
import { getUnformattedCount, formatAllUnformatted } from '@/app/actions/ai-formatter'
import { runRetroScan, applyRetroScanResult, dismissRetroScanResult, type RetroMediumResult } from '@/app/actions/retro-scan'
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
  const [ownEmailAddresses, setOwnEmailAddresses] = useState<string[]>([])
  const [newEmailInput, setNewEmailInput] = useState('')
  const [briefingOptOut, setBriefingOptOut] = useState(false)
  const [isSavingBriefing, setIsSavingBriefing] = useState(false)
  const [blockedSenders, setBlockedSenders] = useState<{ id: string; email: string; created_at: string | null }[]>([])
  const [unblockingId, setUnblockingId] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanDone, setScanDone] = useState(false)
  const [scanAutoApplied, setScanAutoApplied] = useState(0)
  const [scanReview, setScanReview] = useState<RetroMediumResult[]>([])
  const [applyingRetroId, setApplyingRetroId] = useState<string | null>(null)

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
    setBriefingOptOut(result.data.briefing_email_opt_out ?? false)

    // Load inbound email token
    const tokenResult = await getInboundEmailToken()
    if (tokenResult.data) {
      setInboundToken(tokenResult.data.token)
      setLastEmailReceived(tokenResult.data.lastReceivedAt)
    }

    // Load own email addresses
    const ownEmailsResult = await getOwnEmailAddresses()
    if (ownEmailsResult.data) {
      setOwnEmailAddresses(ownEmailsResult.data)
    }

    // Load unformatted count
    const countResult = await getUnformattedCount()
    if (countResult.data !== undefined) {
      setUnformattedCount(countResult.data)
    }

    // Load blocked senders
    const blockedResult = await getBlockedSenders()
    if (blockedResult.data) {
      setBlockedSenders(blockedResult.data)
    }

    setIsLoading(false)
  }

  async function handleUnblock(id: string, email: string) {
    setUnblockingId(id)
    const result = await unblockSender(id)
    setUnblockingId(null)
    if (result.error) {
      toast.error(`Failed to unblock: ${result.error}`)
    } else {
      setBlockedSenders(prev => prev.filter(s => s.id !== id))
      toast.success(`${email} unblocked`)
    }
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

  async function handleBriefingToggle(checked: boolean) {
    setIsSavingBriefing(true)
    const newOptOut = !checked
    setBriefingOptOut(newOptOut)
    const result = await updateBriefingEmailOptOut(newOptOut)
    if (result.error) {
      toast.error('Could not update briefing preference')
      setBriefingOptOut(!newOptOut) // revert
    }
    setIsSavingBriefing(false)
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

  async function handleAddOwnEmail() {
    const email = newEmailInput.trim().toLowerCase()
    if (!email || ownEmailAddresses.includes(email)) return
    if (!email.includes('@')) { toast.error('Enter a valid email address'); return }
    const updated = [...ownEmailAddresses, email]
    setOwnEmailAddresses(updated)
    setNewEmailInput('')
    const result = await updateOwnEmailAddresses(updated)
    if (result.error) { toast.error(result.error); setOwnEmailAddresses(ownEmailAddresses) }
  }

  async function handleRemoveOwnEmail(email: string) {
    const updated = ownEmailAddresses.filter(e => e !== email)
    setOwnEmailAddresses(updated)
    const result = await updateOwnEmailAddresses(updated)
    if (result.error) { toast.error(result.error); setOwnEmailAddresses(ownEmailAddresses) }
  }

  async function handleRunRetroScan() {
    setIsScanning(true)
    setScanDone(false)
    setScanReview([])
    const result = await runRetroScan()
    setIsScanning(false)
    setScanDone(true)
    if (result.error) {
      toast.error(`Scan failed: ${result.error}`)
      return
    }
    setScanAutoApplied(result.auto_applied)
    setScanReview(result.needs_review)
    if (result.auto_applied > 0) {
      toast.success(`${result.auto_applied} obligation${result.auto_applied === 1 ? '' : 's'} automatically flagged`)
    }
  }

  async function handleApplyRetro(entryId: string, actionType: RetroMediumResult['action_type']) {
    setApplyingRetroId(entryId)
    const result = await applyRetroScanResult(entryId, actionType)
    setApplyingRetroId(null)
    if (result.error) {
      toast.error('Could not apply flag')
    } else {
      setScanReview(prev => prev.filter(r => r.id !== entryId))
      toast.success('Flag applied')
    }
  }

  async function handleDismissRetro(entryId: string) {
    setApplyingRetroId(entryId)
    const result = await dismissRetroScanResult(entryId)
    setApplyingRetroId(null)
    if (result.error) {
      toast.error('Could not dismiss')
    } else {
      setScanReview(prev => prev.filter(r => r.id !== entryId))
    }
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

      {/* Daily Briefing Email */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900">Daily Briefing Email</h2>
        <div className="flex items-start gap-3">
          <Checkbox
            id="briefingOptIn"
            checked={!briefingOptOut}
            onCheckedChange={(c) => handleBriefingToggle(c as boolean)}
            disabled={isSavingBriefing}
          />
          <div>
            <Label htmlFor="briefingOptIn" className="font-semibold cursor-pointer">
              Send me a morning briefing email
            </Label>
            <p className="text-sm text-gray-500 mt-1">
              Delivered at 8am each day with your priorities from Insights.
            </p>
          </div>
        </div>
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
                {inboundToken}@correspondenceclerk.com
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${inboundToken}@correspondenceclerk.com`)
                  toast.success('Address copied')
                }}
                className="px-3 py-2 text-sm font-medium rounded border border-gray-300 hover:border-gray-500 transition-colors whitespace-nowrap"
                style={{ color: 'var(--brand-dark)' }}
              >
                Copy
              </button>
            </div>

            {/* My email addresses */}
            <div className="mb-5 pb-5 border-b border-gray-100">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--brand-dark)' }}>My email addresses</h3>
              <p className="text-xs text-gray-500 mb-3">
                If you forward emails from your Sent folder, add your sending addresses here so we know they&apos;re yours — otherwise forwarded sent mail looks like received mail. Your sign-in email is always recognised automatically.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {/* Auth email — always present, cannot be removed */}
                {userEmail && (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm"
                    style={{ background: 'rgba(44,74,110,0.08)', color: 'var(--brand-dark)' }}
                  >
                    {userEmail}
                    <span className="text-gray-400">(primary)</span>
                  </span>
                )}
                {/* Additional registered addresses */}
                {ownEmailAddresses.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm"
                    style={{ background: 'rgba(44,74,110,0.08)', color: 'var(--brand-dark)' }}
                  >
                    {email}
                    <button
                      onClick={() => handleRemoveOwnEmail(email)}
                      className="text-gray-400 hover:text-gray-700 leading-none"
                      aria-label={`Remove ${email}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmailInput}
                  onChange={e => setNewEmailInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddOwnEmail())}
                  placeholder="you@example.com"
                  className="flex-1 text-sm px-3 py-1.5 rounded-sm"
                  style={{ border: '1px solid rgba(0,0,0,0.15)', color: 'var(--brand-dark)' }}
                />
                <button
                  onClick={handleAddOwnEmail}
                  className="px-3 py-1.5 text-sm font-medium text-white rounded-sm"
                  style={{ backgroundColor: '#2C4A6E' }}
                >
                  Add
                </button>
              </div>
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
                  backgroundColor: sendingTest ? 'rgba(0,0,0,0.2)' : '#2C4A6E',
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

      {/* Blocked Senders */}
      <div className="bg-white border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold mb-2 text-gray-900">Blocked Senders</h2>
        <p className="text-sm text-gray-600 mb-4">
          Emails from these addresses are automatically discarded when forwarded to your inbox.
        </p>
        {blockedSenders.length === 0 ? (
          <p className="text-sm text-gray-500">No blocked senders.</p>
        ) : (
          <div className="space-y-2">
            {blockedSenders.map(sender => (
              <div
                key={sender.id}
                className="flex items-center justify-between py-2 px-3 rounded-sm"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{sender.email}</span>
                  {sender.created_at && (
                    <span className="text-xs text-gray-400 ml-3">
                      Blocked {formatLastReceived(sender.created_at)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleUnblock(sender.id, sender.email)}
                  disabled={unblockingId === sender.id}
                  className="text-sm font-medium px-3 py-1 rounded-sm transition-colors"
                  style={{
                    color: unblockingId === sender.id ? 'rgba(0,0,0,0.3)' : 'rgba(180,0,0,0.7)',
                    border: '1px solid rgba(180,0,0,0.2)',
                    cursor: unblockingId === sender.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  {unblockingId === sender.id ? 'Unblocking…' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
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
            className="px-4 py-2 text-sm font-semibold text-white rounded-sm transition-colors"
            style={{
              backgroundColor: isFormatting ? 'rgba(0,0,0,0.2)' : '#2C4A6E',
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
        <div className="space-y-6">
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

          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">Obligation Scan</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Scan historical correspondence for unresolved obligations (invoices, commitments, follow-ups)
                  that were filed before automatic detection was in place. High-confidence results are applied
                  automatically; medium-confidence results are shown for review.
                </p>
              </div>
              <button
                onClick={handleRunRetroScan}
                disabled={isScanning}
                className="shrink-0 px-4 py-2 text-sm font-semibold text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: isScanning ? 'rgba(0,0,0,0.2)' : '#2C4A6E' }}
              >
                {isScanning ? 'Scanning…' : scanDone ? 'Run again' : 'Run scan'}
              </button>
            </div>

            {/* Scan results */}
            {scanDone && !isScanning && (
              <div className="mt-4">
                {scanAutoApplied > 0 && (
                  <p className="text-sm text-green-700 mb-3">
                    {scanAutoApplied} obligation{scanAutoApplied === 1 ? '' : 's'} automatically flagged in Actions.
                  </p>
                )}

                {scanReview.length === 0 && (
                  <p className="text-sm text-gray-500">
                    {scanAutoApplied === 0 ? 'No unresolved obligations found.' : 'No items require review.'}
                  </p>
                )}

                {scanReview.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-3">
                      {scanReview.length} item{scanReview.length === 1 ? '' : 's'} need review — apply or skip each:
                    </p>
                    <div className="space-y-2">
                      {scanReview.map(item => (
                        <div
                          key={item.id}
                          className="border border-amber-200 bg-amber-50 p-3 flex items-start gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                {item.action_type.replace('_', ' ')}
                              </span>
                              <span className="text-xs text-gray-500">
                                {item.business_name} · {item.type} · {item.entry_date.slice(0, 10)}
                              </span>
                            </div>
                            {item.subject && (
                              <p className="text-sm font-medium text-gray-800 truncate">{item.subject}</p>
                            )}
                            {item.snippet && (
                              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{item.snippet}</p>
                            )}
                            <p className="text-xs text-gray-500 mt-1 italic">{item.reasoning}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleApplyRetro(item.id, item.action_type)}
                              disabled={applyingRetroId === item.id}
                              className="px-3 py-1 text-xs font-semibold text-white bg-brand-navy hover:bg-brand-navy-hover transition-colors disabled:opacity-50"
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => handleDismissRetro(item.id)}
                              disabled={applyingRetroId === item.id}
                              className="px-3 py-1 text-xs font-semibold border border-gray-300 hover:border-gray-500 transition-colors disabled:opacity-50"
                              style={{ color: 'var(--brand-dark)' }}
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

const ERROR_MESSAGES: Record<string, string> = {
  google_denied: 'Google access was denied. Please try again.',
  google_invalid: 'Invalid OAuth response from Google.',
  google_state: 'Security check failed (state mismatch). Please try again.',
  google_no_token: 'No access token received from Google.',
  google_no_refresh: 'No refresh token received. Try disconnecting and reconnecting your Google account.',
  google_no_profile: 'Your account isn\'t fully set up yet. Please complete onboarding before connecting Gmail.',
  google_failed: 'Google connection failed. Check server logs.',
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string; detail?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { error: errorCode, detail } = await searchParams
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? `Unknown error: ${errorCode}`) : null

  // Check which providers are connected
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('google_access_token, microsoft_access_token')
    .eq('id', user.id)
    .single()

  const gmailConnected = !!profile?.google_access_token
  const outlookConnected = !!profile?.microsoft_access_token

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="font-[Lora,serif] text-2xl font-semibold text-brand-dark mb-2">Import emails</h1>
      <p className="text-gray-500 text-sm mb-8">
        Connect your email account to pull in months of past correspondence. New businesses and contacts will be
        discovered automatically — you review everything before it&apos;s saved.
      </p>

      {errorMessage && (
        <div className="border border-red-300 bg-red-50 text-red-800 text-sm px-4 py-3 rounded mb-6">
          <p>{errorMessage}</p>
          {detail && <p className="mt-1 font-mono text-xs opacity-75">{detail}</p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {/* Gmail card */}
        <div className="bg-white border border-gray-200 rounded p-6 shadow-[var(--shadow-sm,0_1px_3px_rgba(0,0,0,0.06))] flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-red-50 border border-red-100 rounded flex items-center justify-center text-sm font-bold text-red-500">
              G
            </div>
            <h2 className="font-medium text-brand-dark">Gmail</h2>
            {gmailConnected && (
              <span className="ml-auto text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-5 flex-1">
            Gmail and all Google Workspace (business) accounts
          </p>
          {gmailConnected ? (
            <Link
              href="/import/gmail"
              className="text-center px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Import from Gmail
            </Link>
          ) : (
            <a
              href="/api/auth/google"
              className="text-center px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Connect Gmail
            </a>
          )}
        </div>

        {/* Outlook card */}
        <div className="bg-white border border-gray-200 rounded p-6 shadow-[var(--shadow-sm,0_1px_3px_rgba(0,0,0,0.06))] flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded flex items-center justify-center text-sm font-bold text-blue-500">
              O
            </div>
            <h2 className="font-medium text-brand-dark">Outlook</h2>
            {outlookConnected && (
              <span className="ml-auto text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-5 flex-1">
            Outlook.com, Hotmail, and Microsoft 365 business accounts
          </p>
          {outlookConnected ? (
            <Link
              href="/import/outlook"
              className="text-center px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Import from Outlook
            </Link>
          ) : (
            <a
              href="/api/auth/microsoft"
              className="text-center px-4 py-2 bg-brand-navy text-white text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              Connect Outlook
            </a>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <p className="text-sm text-gray-500">
          Prefer to import one email at a time?{' '}
          <Link href="/install-bookmarklet" className="text-brand-navy hover:underline">
            Install the bookmarklet
          </Link>{' '}
          to import directly from your browser.
        </p>
      </div>
    </div>
  )
}

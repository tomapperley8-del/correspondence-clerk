'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInboundEmailToken } from '@/app/actions/inbound-email'
import { toast } from '@/lib/toast'

export default function EmailForwardingOnboardingPage() {
  const [inboundAddress, setInboundAddress] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    getInboundEmailToken().then((result) => {
      if (result.data?.token) {
        setInboundAddress(`${result.data.token}@correspondenceclerk.com`)
      }
    })
  }, [])

  const handleCopy = () => {
    if (!inboundAddress) return
    navigator.clipboard.writeText(inboundAddress)
    toast.success('Address copied')
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div
        className="hidden md:flex md:w-2/5 flex-col justify-between p-12"
        style={{ backgroundColor: 'var(--header-bg)' }}
      >
        <Link
          href="/"
          className="text-xl font-bold text-white"
          style={{ fontFamily: 'Lora, Georgia, serif' }}
        >
          Correspondence Clerk
        </Link>
        <div>
          <div className="mb-4 flex gap-2">
            <span className="inline-block w-6 h-1 rounded-full bg-white opacity-30" />
            <span className="inline-block w-6 h-1 rounded-full bg-white opacity-30" />
            <span className="inline-block w-6 h-1 rounded-full bg-white opacity-30" />
            <span className="inline-block w-6 h-1 rounded-full bg-white opacity-90" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>Step 4 of 4</p>
          <p
            className="text-2xl font-semibold text-white leading-snug mb-3"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            Capture emails automatically.
          </p>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            One address handles both directions — emails you receive and emails you send.
          </p>
        </div>
        <p className="text-xs" style={{ color: '#475569' }}>
          &copy; {new Date().getFullYear()} Correspondence Clerk
        </p>
      </div>

      {/* Right panel */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-12"
        style={{ backgroundColor: 'var(--main-bg)' }}
      >
        <div className="w-full max-w-sm">
          <h1
            className="text-2xl font-bold mb-2 text-gray-900"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            Set up email capture
          </h1>
          <p className="text-sm text-gray-500 mb-8">Optional — you can do this any time from Settings</p>

          {/* Inbound address */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-2">Your unique address</p>
            {inboundAddress ? (
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-xs px-3 py-2 rounded-sm bg-gray-50 border select-all truncate"
                  style={{ borderColor: 'rgba(0,0,0,0.12)', color: 'var(--brand-dark)', fontFamily: 'monospace' }}
                >
                  {inboundAddress}
                </code>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 text-sm font-medium rounded-sm border transition-colors whitespace-nowrap"
                  style={{ borderColor: 'rgba(0,0,0,0.15)', color: 'var(--brand-dark)' }}
                >
                  Copy
                </button>
              </div>
            ) : (
              <div className="h-9 bg-gray-100 rounded-sm animate-pulse" />
            )}
          </div>

          {/* Two use cases */}
          <div className="space-y-4 mb-8">
            <div
              className="p-4 rounded-sm"
              style={{ border: '1px solid rgba(0,0,0,0.08)', backgroundColor: 'var(--brand-warm)' }}
            >
              <p className="text-sm font-semibold text-gray-800 mb-1">Capturing received emails</p>
              <p className="text-sm text-gray-600">
                Set up a forwarding rule in Gmail or Outlook to forward incoming emails to your address above. They&rsquo;ll be filed as <strong>received</strong> and auto-matched to businesses you&rsquo;ve already added.
              </p>
            </div>

            <div
              className="p-4 rounded-sm"
              style={{ border: '1px solid rgba(0,0,0,0.08)', backgroundColor: 'var(--brand-warm)' }}
            >
              <p className="text-sm font-semibold text-gray-800 mb-1">Capturing sent emails</p>
              <p className="text-sm text-gray-600">
                BCC your address on emails you send. The system detects it was a sent email and files it as <strong>sent</strong>, matching the business from the recipients automatically.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-brand-navy hover:bg-brand-navy-hover text-white font-semibold py-3 rounded-sm transition-colors"
            >
              Go to dashboard
            </button>
            <Link
              href="/settings"
              className="w-full py-3 text-sm text-center text-gray-500 hover:text-gray-700 transition-colors"
            >
              View full setup instructions in Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createOrganization } from '@/app/actions/organizations'
import Link from 'next/link'

export default function CreateOrganizationPage() {
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!organizationName.trim()) {
      setError('Organization name is required')
      return
    }

    setIsLoading(true)

    const result = await createOrganization(organizationName)

    if (result.error) {
      setError(result.error)
      setIsLoading(false)
    } else {
      router.push('/settings/organization?welcome=true')
    }
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
          <p
            className="text-2xl font-semibold text-white leading-snug mb-3"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            One last step before you get started.
          </p>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Set up your organisation and you&apos;ll be ready to go.
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
            Name your organisation
          </h1>
          <p className="text-sm text-gray-500 mb-8">You can change this later in settings</p>

          {error && (
            <div
              className="px-4 py-3 mb-6 rounded-sm"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid rgba(220,38,38,0.2)' }}
            >
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label
                htmlFor="organizationName"
                className="block mb-2 font-semibold text-sm text-gray-700"
              >
                Organisation name
              </Label>
              <Input
                id="organizationName"
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
                disabled={isLoading}
                className="w-full"
                placeholder="e.g. Acme Consulting"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand-navy hover:bg-brand-navy-hover text-white font-semibold py-3 rounded-sm transition-colors disabled:opacity-60"
            >
              {isLoading ? 'Creating...' : 'Create Organisation'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

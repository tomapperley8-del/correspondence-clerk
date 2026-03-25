'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBusiness } from '@/app/actions/businesses'
import { createContact } from '@/app/actions/contacts'
import Link from 'next/link'

export default function FirstBusinessPage() {
  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactRole, setContactRole] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!businessName.trim()) {
      setError('Business name is required')
      return
    }
    if (!contactName.trim()) {
      setError('Contact name is required')
      return
    }

    setIsLoading(true)

    const bizResult = await createBusiness({ name: businessName.trim() })
    if (bizResult.error) {
      setError(bizResult.error)
      setIsLoading(false)
      return
    }

    const businessId = bizResult.data!.id
    const contactResult = await createContact({
      business_id: businessId,
      name: contactName.trim(),
      role: contactRole.trim() || undefined,
      email: contactEmail.trim() || undefined,
    })

    if (contactResult.error) {
      setError(contactResult.error)
      setIsLoading(false)
      return
    }

    const contactId = contactResult.data!.id
    router.push(`/new-entry?businessId=${businessId}&contactId=${contactId}&onboarding=true`)
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
            <span className="inline-block w-6 h-1 rounded-full bg-white opacity-90" />
            <span className="inline-block w-6 h-1 rounded-full bg-white opacity-30" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>Step 2 of 3</p>
          <p
            className="text-2xl font-semibold text-white leading-snug mb-3"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            Add your first business and contact.
          </p>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Every entry needs a named person. You can add more later.
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
            Business &amp; contact
          </h1>
          <p className="text-sm text-gray-500 mb-8">You can add more businesses and contacts later</p>

          {error && (
            <div
              className="px-4 py-3 mb-6 rounded-sm"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid rgba(220,38,38,0.2)' }}
            >
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="businessName" className="block mb-2 font-semibold text-sm text-gray-700">
                Business name
              </Label>
              <Input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                disabled={isLoading}
                placeholder="e.g. Hartley & Sons Solicitors"
                autoFocus
              />
            </div>

            <div
              className="border-t pt-5"
              style={{ borderColor: 'rgba(0,0,0,0.06)' }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Contact at this business</p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="contactName" className="block mb-2 font-semibold text-sm text-gray-700">
                    Full name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contactName"
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                    disabled={isLoading}
                    placeholder="e.g. Mark Davies"
                  />
                </div>

                <div>
                  <Label htmlFor="contactRole" className="block mb-2 font-semibold text-sm text-gray-700">
                    Role <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="contactRole"
                    type="text"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    disabled={isLoading}
                    placeholder="e.g. Managing Director"
                  />
                </div>

                <div>
                  <Label htmlFor="contactEmail" className="block mb-2 font-semibold text-sm text-gray-700">
                    Email <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    disabled={isLoading}
                    placeholder="e.g. mark@hartleysons.co.uk"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand-navy hover:bg-brand-navy-hover text-white font-semibold py-3 rounded-sm transition-colors disabled:opacity-60"
            >
              {isLoading ? 'Creating...' : 'Continue to first entry'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { updateOrganizationProfile } from '@/app/actions/organizations'
import Link from 'next/link'

const INDUSTRIES = [
  'Accounting & Finance',
  'Architecture & Design',
  'Consulting',
  'Construction & Property',
  'Education',
  'Events & Hospitality',
  'Healthcare & Wellness',
  'Legal',
  'Marketing & PR',
  'Media & Publishing',
  'Retail & E-commerce',
  'Technology',
  'Other',
]

export default function DescribeYourBusinessPage() {
  const [description, setDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const result = await updateOrganizationProfile(description.trim(), industry)
    if (result.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }

    router.push('/onboarding/first-business')
  }

  const handleSkip = () => {
    router.push('/onboarding/first-business')
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
            <span className="inline-block w-6 h-1 rounded-full bg-white opacity-30" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>Step 2 of 4</p>
          <p
            className="text-2xl font-semibold text-white leading-snug mb-3"
            style={{ fontFamily: 'Lora, Georgia, serif' }}
          >
            Tell us about your work.
          </p>
          <p className="text-sm" style={{ color: '#94a3b8' }}>
            Helps the Daily Briefing give you more relevant context.
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
            Describe your business
          </h1>
          <p className="text-sm text-gray-500 mb-8">Optional — you can skip this for now</p>

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
              <Label htmlFor="industry" className="block mb-2 font-semibold text-sm text-gray-700">
                Industry <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                disabled={isLoading}
                className="w-full px-3 py-2 text-sm border rounded-sm bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-navy"
                style={{ borderColor: 'rgba(0,0,0,0.15)' }}
              >
                <option value="">Select an industry…</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="description" className="block mb-2 font-semibold text-sm text-gray-700">
                What do you do? <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                rows={4}
                placeholder="e.g. I run a small consultancy helping mid-size businesses improve their operations. I manage relationships with about 30 clients."
                className="w-full px-3 py-2 text-sm border rounded-sm bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-navy resize-none"
                style={{ borderColor: 'rgba(0,0,0,0.15)' }}
              />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-navy hover:bg-brand-navy-hover text-white font-semibold py-3 rounded-sm transition-colors disabled:opacity-60"
              >
                {isLoading ? 'Saving...' : 'Continue'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isLoading}
                className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Skip for now
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

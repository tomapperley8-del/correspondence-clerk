'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createOrganization } from '@/app/actions/organizations'

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
      // Success - redirect to dashboard
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border-2 border-gray-800 p-8">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">
            Welcome to Correspondence Clerk
          </h1>
          <p className="text-gray-600 mb-6">
            Create your organization to get started
          </p>

          {error && (
            <div className="border-2 border-red-600 bg-red-50 px-4 py-3 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label
                htmlFor="organizationName"
                className="block mb-2 font-semibold"
              >
                Organization Name <span className="text-red-600">*</span>
              </Label>
              <Input
                id="organizationName"
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
                disabled={isLoading}
                className="w-full"
                placeholder="Enter your organization name"
                autoFocus
              />
              <p className="text-gray-500 text-xs mt-1">
                You can change this later in settings
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 font-semibold"
            >
              {isLoading ? 'Creating organization...' : 'Create Organization'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

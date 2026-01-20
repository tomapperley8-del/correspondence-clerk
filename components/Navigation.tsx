'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'
import { getCurrentOrganization } from '@/app/actions/organizations'

type Organization = {
  id: string
  name: string
}

export function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)

      // Fetch organization if user is authenticated
      if (user) {
        const orgResult = await getCurrentOrganization()
        if (orgResult.data) {
          setOrganization(orgResult.data)
        }
      }

      setIsLoading(false)
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      // Fetch organization when user logs in
      if (currentUser) {
        const orgResult = await getCurrentOrganization()
        if (orgResult.data) {
          setOrganization(orgResult.data)
        }
      } else {
        setOrganization(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Don't show navigation on auth pages, onboarding, or invite pages
  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname?.startsWith('/auth/') ||
    pathname?.startsWith('/onboarding/') ||
    pathname?.startsWith('/invite/')
  ) {
    return null
  }

  if (isLoading) {
    return (
      <nav className="bg-white border-b-2 border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold">Correspondence Clerk</span>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  if (!user) {
    return null
  }

  return (
    <nav className="bg-white border-b-2 border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              href="/dashboard"
              className="text-xl font-bold text-gray-900"
            >
              Correspondence Clerk
            </Link>

            <div className="flex space-x-4">
              <Link
                href="/dashboard"
                className={`px-3 py-2 text-sm font-medium ${
                  pathname === '/dashboard'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Dashboard
              </Link>

              <Link
                href="/new-entry"
                className={`px-3 py-2 text-sm font-medium ${
                  pathname === '/new-entry'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                New Entry
              </Link>

              <Link
                href="/search"
                className={`px-3 py-2 text-sm font-medium ${
                  pathname === '/search'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Search
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-gray-600">{user.email}</div>
              {organization && (
                <div className="text-xs text-gray-500">{organization.name}</div>
              )}
            </div>
            <Link
              href="/settings/organization"
              className={`px-3 py-2 text-sm font-medium ${
                pathname === '/settings/organization'
                  ? 'text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Settings
            </Link>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="text-gray-600 hover:text-gray-900"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}

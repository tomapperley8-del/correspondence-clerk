'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'
import { getCurrentOrganization } from '@/app/actions/organizations'
import { getUserProfile } from '@/app/actions/user-profile'

type Organization = {
  id: string
  name: string
}

export function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
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

      // Fetch organization and display name if user is authenticated
      if (user) {
        const orgResult = await getCurrentOrganization()
        if (orgResult.data) {
          setOrganization(orgResult.data)
        }

        const profileResult = await getUserProfile()
        if (profileResult.data) {
          setDisplayName(profileResult.data.display_name)
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

      // Fetch organization and display name when user logs in
      if (currentUser) {
        const orgResult = await getCurrentOrganization()
        if (orgResult.data) {
          setOrganization(orgResult.data)
        }

        const profileResult = await getUserProfile()
        if (profileResult.data) {
          setDisplayName(profileResult.data.display_name)
        }
      } else {
        setOrganization(null)
        setDisplayName(null)
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
      <nav className="bg-black border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-white">Correspondence Clerk</span>
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
    <nav aria-label="Main navigation" className="bg-black border-b-2 border-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              href="/dashboard"
              className="text-xl font-bold text-white"
            >
              Correspondence Clerk
            </Link>

            <div className="flex space-x-1">
              <Link
                href="/dashboard"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === '/dashboard'
                    ? 'text-white bg-[#98bf64]'
                    : 'text-white hover:text-[#98bf64]'
                }`}
              >
                Dashboard
              </Link>
              <span className="text-white self-center">|</span>

              <Link
                href="/new-entry"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === '/new-entry'
                    ? 'text-white bg-[#98bf64]'
                    : 'text-white hover:text-[#98bf64]'
                }`}
              >
                New Entry
              </Link>
              <span className="text-white self-center">|</span>

              <Link
                href="/search"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === '/search'
                    ? 'text-white bg-[#98bf64]'
                    : 'text-white hover:text-[#98bf64]'
                }`}
              >
                Search
              </Link>
              <span className="text-white self-center">|</span>

              <Link
                href="/help"
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === '/help'
                    ? 'text-white bg-[#98bf64]'
                    : 'text-white hover:text-[#98bf64]'
                }`}
              >
                Help
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-white">
                {displayName || user.email?.split('@')[0] || user.email}
              </div>
              {organization && (
                <div className="text-xs text-gray-400">{organization.name}</div>
              )}
            </div>
            <Link
              href="/settings"
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                pathname?.startsWith('/settings')
                  ? 'text-white bg-[#98bf64]'
                  : 'text-white hover:text-[#98bf64]'
              }`}
            >
              Settings
            </Link>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="text-white hover:text-[#98bf64]"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}

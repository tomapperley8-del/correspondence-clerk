'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'
import { getCurrentOrganization } from '@/app/actions/organizations'
import { getUserProfile } from '@/app/actions/user-profile'
import { getOutstandingActionsCount } from '@/app/actions/correspondence'
import { useChat } from '@/components/ChatContext'

function OutreachButton() {
  const { isOpen, toggle } = useChat()
  return (
    <button
      onClick={toggle}
      className={`px-4 h-16 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
        isOpen
          ? 'text-white bg-[#7C9A5E]'
          : 'text-white hover:bg-[#7C9A5E]/20'
      }`}
    >
      Daily Briefing
    </button>
  )
}

type Organization = {
  id: string
  name: string
}

export function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionsCount, setActionsCount] = useState(0)
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

        getOutstandingActionsCount().then(setActionsCount)
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

        getOutstandingActionsCount().then(setActionsCount)
      } else {
        setOrganization(null)
        setDisplayName(null)
        setActionsCount(0)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  // Re-fetch action count on navigation
  useEffect(() => {
    if (user) getOutstandingActionsCount().then(setActionsCount)
  }, [pathname, user])

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
      <nav className="bg-[#1E293B] border-b-2 border-[#1E293B]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-white" style={{ fontFamily: 'Lora, Georgia, serif' }}>Correspondence Clerk</span>
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
    <nav aria-label="Main navigation" className="bg-[#1E293B] border-b-2 border-[#1E293B]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              href="/dashboard"
              className="text-xl font-bold text-white"
              style={{ fontFamily: 'Lora, Georgia, serif' }}
            >
              Correspondence Clerk
            </Link>

            <div className="flex h-16">
              <Link
                href="/dashboard"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/dashboard'
                    ? 'text-white bg-[#7C9A5E]'
                    : 'text-white hover:bg-[#7C9A5E]/20'
                }`}
              >
                Dashboard
              </Link>

              <Link
                href="/new-entry"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/new-entry'
                    ? 'text-white bg-[#7C9A5E]'
                    : 'text-white hover:bg-[#7C9A5E]/20'
                }`}
              >
                New Entry
              </Link>

              <Link
                href="/search"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/search'
                    ? 'text-white bg-[#7C9A5E]'
                    : 'text-white hover:bg-[#7C9A5E]/20'
                }`}
              >
                Search
              </Link>

              <Link
                href="/reminders"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/reminders'
                    ? 'text-white bg-[#7C9A5E]'
                    : 'text-white hover:bg-[#7C9A5E]/20'
                }`}
              >
                Reminders
              </Link>

              <Link
                href="/actions-page"
                className={`px-4 flex items-center gap-2 text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/actions-page'
                    ? 'text-white bg-[#7C9A5E]'
                    : 'text-white hover:bg-[#7C9A5E]/20'
                }`}
              >
                Actions
                {actionsCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {actionsCount > 99 ? '99+' : actionsCount}
                  </span>
                )}
              </Link>

              <Link
                href="/help"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/help'
                    ? 'text-white bg-[#7C9A5E]'
                    : 'text-white hover:bg-[#7C9A5E]/20'
                }`}
              >
                Help
              </Link>
              <OutreachButton />
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
              className={`px-4 h-16 flex items-center text-sm font-medium transition-colors ${
                pathname?.startsWith('/settings')
                  ? 'text-white bg-[#7C9A5E]'
                  : 'text-white hover:bg-[#7C9A5E]/20'
              }`}
            >
              Settings
            </Link>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="text-white hover:text-[#7C9A5E]"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}

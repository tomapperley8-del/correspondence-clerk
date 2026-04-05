'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'
import { getNavData } from '@/app/actions/organizations'
import { useInsights } from '@/components/InsightsContext'

function InsightsButton() {
  const { isOpen, toggle } = useInsights()
  return (
    <button
      onClick={toggle}
      className={`px-4 h-16 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
        isOpen
          ? 'text-white bg-brand-olive'
          : 'text-white hover:bg-brand-olive/20'
      }`}
    >
      Insights
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
  const [inboundCount, setInboundCount] = useState(0)
  const [hasCorrespondence, setHasCorrespondence] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { close: closeInsights } = useInsights()
  const navFetchedAt = useRef(0)

  async function loadNavData() {
    const nav = await getNavData()
    setDisplayName(nav.displayName)
    setActionsCount(nav.actionsCount)
    setInboundCount(nav.inboundCount)
    setHasCorrespondence(nav.hasCorrespondence)
    if (nav.organizationId) {
      setOrganization({ id: nav.organizationId, name: nav.organizationName ?? '' })
    } else {
      setOrganization(null)
    }
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        navFetchedAt.current = Date.now()
        await loadNavData()
      }
      setIsLoading(false)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await loadNavData()
      } else {
        setOrganization(null)
        setDisplayName(null)
        setActionsCount(0)
        setInboundCount(0)
        setHasCorrespondence(false)
      }
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh action count on navigation — throttled to once per 30s
  // Also close the Daily Briefing slide-out when navigating to the dedicated page
  useEffect(() => {
    if (user && Date.now() - navFetchedAt.current > 30_000) {
      navFetchedAt.current = Date.now()
      loadNavData()
    }
    if (pathname === '/insights') closeInsights()
    setMobileOpen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

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
      <nav className="bg-brand-dark border-b border-white/10">
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
    <nav aria-label="Main navigation" className="bg-brand-dark border-b border-white/10">
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

            <div className="hidden md:flex h-16">
              <Link
                href="/dashboard"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/dashboard'
                    ? 'text-white bg-brand-olive'
                    : 'text-white hover:bg-brand-olive/20'
                }`}
              >
                Dashboard
              </Link>

              <Link
                href="/new-entry"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/new-entry'
                    ? 'text-white bg-brand-olive'
                    : 'text-white hover:bg-brand-olive/20'
                }`}
              >
                New Entry
              </Link>

              <Link
                href="/search"
                className={`px-4 flex items-center gap-2 text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/search'
                    ? 'text-white bg-brand-olive'
                    : 'text-white hover:bg-brand-olive/20'
                }`}
              >
                Search
                <kbd className="hidden lg:inline-block text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-white/60 font-mono">
                  Ctrl+K
                </kbd>
              </Link>

              <Link
                href="/inbox"
                className={`px-4 flex items-center gap-2 text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/inbox'
                    ? 'text-white bg-brand-olive'
                    : 'text-white hover:bg-brand-olive/20'
                }`}
              >
                Inbox
                {inboundCount > 0 && (
                  <span
                    title={`${inboundCount} email${inboundCount === 1 ? '' : 's'} to file`}
                    className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
                  >
                    {inboundCount > 99 ? '99+' : inboundCount}
                  </span>
                )}
              </Link>

              {hasCorrespondence && (
                <Link
                  href="/actions"
                  className={`px-4 flex items-center gap-2 text-sm font-medium transition-colors border-r border-white/20 ${
                    pathname === '/actions'
                      ? 'text-white bg-brand-olive'
                      : 'text-white hover:bg-brand-olive/20'
                  }`}
                >
                  Actions
                  {actionsCount > 0 && (
                    <span
                      title={`${actionsCount} action${actionsCount === 1 ? '' : 's'} need attention`}
                      className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
                    >
                      {actionsCount > 99 ? '99+' : actionsCount}
                    </span>
                  )}
                </Link>
              )}

              <Link
                href="/help"
                className={`px-4 flex items-center text-sm font-medium transition-colors border-r border-white/20 ${
                  pathname === '/help'
                    ? 'text-white bg-brand-olive'
                    : 'text-white hover:bg-brand-olive/20'
                }`}
              >
                Help
              </Link>
              {pathname !== '/insights' && pathname !== '/dashboard' && <InsightsButton />}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle navigation menu"
              className="md:hidden flex flex-col gap-1 p-2 text-white"
            >
              <span className="block w-5 h-0.5 bg-white" />
              <span className="block w-5 h-0.5 bg-white" />
              <span className="block w-5 h-0.5 bg-white" />
            </button>
            <div className="hidden md:block text-right">
              <div className="text-sm text-white">
                {displayName || user.email?.split('@')[0] || user.email}
              </div>
              {organization && (
                <div className="text-xs text-gray-400">{organization.name}</div>
              )}
            </div>
            <Link
              href="/settings"
              className={`hidden md:flex px-4 h-16 items-center text-sm font-medium transition-colors ${
                pathname?.startsWith('/settings')
                  ? 'text-white bg-brand-olive'
                  : 'text-white hover:bg-brand-olive/20'
              }`}
            >
              Settings
            </Link>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="hidden md:inline-flex text-white hover:text-brand-olive"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="md:hidden bg-brand-dark border-t border-white/20">
          <div className="px-4 py-2 space-y-1">
            {[
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/new-entry', label: 'New Entry' },
              { href: '/search', label: 'Search' },
              { href: '/inbox', label: `Inbox${inboundCount > 0 ? ` (${inboundCount})` : ''}` },
              ...(hasCorrespondence ? [{ href: '/actions', label: `Actions${actionsCount > 0 ? ` (${actionsCount})` : ''}` }] : []),
              { href: '/help', label: 'Help' },
              { href: '/settings', label: 'Settings' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`block px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === href || (href === '/settings' && pathname?.startsWith('/settings'))
                    ? 'text-white bg-brand-olive'
                    : 'text-white hover:bg-brand-olive/20'
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="pt-2 pb-1 border-t border-white/20">
              <p className="text-xs text-gray-400 px-3 pb-2">
                {displayName || user.email?.split('@')[0] || user.email}
                {organization && ` · ${organization.name}`}
              </p>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-3 py-2 text-sm font-medium text-white hover:bg-brand-olive/20 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

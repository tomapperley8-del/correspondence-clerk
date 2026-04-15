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
    <>
    <nav aria-label="Main navigation" className="bg-brand-dark border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              href="/dashboard"
              className="text-xl font-bold text-white"
              style={{ fontFamily: 'Lora, Georgia, serif' }}
            >
              <span className="hidden sm:inline">Correspondence Clerk</span>
              <span className="sm:hidden">Clerk</span>
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

              <button
                onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k', bubbles: true }))}
                className="px-4 h-16 flex items-center gap-2 text-sm font-medium transition-colors border-r border-white/20 text-white hover:bg-brand-olive/20"
              >
                Search
                <kbd className="hidden lg:inline-block text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-white/60 font-mono">
                  Ctrl+K
                </kbd>
              </button>

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

              {pathname !== '/insights' && <InsightsButton />}
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
            <div className="hidden md:block text-right max-w-[160px]">
              <div className="text-sm text-white truncate">
                {displayName || user.email?.split('@')[0] || user.email}
              </div>
              {organization && (
                <div className="text-xs text-gray-400 truncate">{organization.name}</div>
              )}
            </div>
            <Link
              href="/help"
              aria-label="Help"
              title="Help"
              className={`hidden md:flex px-3 h-16 items-center text-sm font-medium transition-colors ${
                pathname === '/help'
                  ? 'text-white bg-brand-olive'
                  : 'text-white/60 hover:text-white hover:bg-brand-olive/20'
              }`}
            >
              ?
            </Link>
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

    </nav>

      {/* Mobile slide-out drawer */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="md:hidden fixed top-0 right-0 z-50 h-full w-72 bg-brand-dark flex flex-col shadow-xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/20">
              <span className="text-base font-semibold text-white" style={{ fontFamily: 'Lora, Georgia, serif' }}>
                Menu
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="p-2 text-white/70 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Nav items */}
            <div className="flex-1 overflow-y-auto py-2">
              {[
                { href: '/dashboard', label: 'Dashboard' },
                { href: '/new-entry', label: 'New Entry' },
                { href: '/search', label: 'Search' },
                { href: '/inbox', label: 'Inbox', badge: inboundCount > 0 ? inboundCount : null },
                ...(hasCorrespondence ? [{ href: '/actions', label: 'Actions', badge: actionsCount > 0 ? actionsCount : null }] : []),
                { href: '/insights', label: 'Insights' },
                { href: '/help', label: 'Help' },
                { href: '/settings', label: 'Settings' },
              ].map(({ href, label, badge }: { href: string; label: string; badge?: number | null }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors ${
                    pathname === href || (href === '/settings' && pathname?.startsWith('/settings'))
                      ? 'text-white bg-brand-olive'
                      : 'text-white hover:bg-brand-olive/20'
                  }`}
                >
                  {label}
                  {badge != null && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            {/* User / Logout footer */}
            <div className="border-t border-white/20 px-5 py-4">
              <p className="text-xs text-gray-400 truncate mb-3">
                {displayName || user.email?.split('@')[0] || user.email}
                {organization && ` · ${organization.name}`}
              </p>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-white hover:text-brand-olive transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </>
      )}

      {/* Mobile bottom bar — primary actions always accessible */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-brand-dark border-t border-white/20 flex">
        <Link
          href="/dashboard"
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors ${
            pathname === '/dashboard' ? 'text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Home
        </Link>
        <Link
          href="/new-entry"
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors ${
            pathname === '/new-entry' ? 'text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Entry
        </Link>
        {hasCorrespondence && (
          <Link
            href="/actions"
            className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors relative ${
              pathname === '/actions' ? 'text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            <span className="relative">
              <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {actionsCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {actionsCount > 20 ? '20+' : actionsCount}
                </span>
              )}
            </span>
            Actions
          </Link>
        )}
        <Link
          href="/inbox"
          className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors relative ${
            pathname === '/inbox' ? 'text-white' : 'text-white/60 hover:text-white'
          }`}
        >
          <span className="relative">
            <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            {inboundCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {inboundCount > 20 ? '20+' : inboundCount}
              </span>
            )}
          </span>
          Inbox
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium text-white/60 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          More
        </button>
      </div>
    </>
  )
}

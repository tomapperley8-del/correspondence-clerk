'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { getNavData } from '@/app/actions/organizations'
import { useInsights } from '@/components/InsightsContext'

type Organization = {
  id: string
  name: string
}

export function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [overdueCount, setOverdueCount] = useState<number | null>(null)
  const [inboundCount, setInboundCount] = useState(0)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { close: closeInsights, toggle: toggleInsights } = useInsights()
  const navFetchedAt = useRef(0)

  async function loadNavData() {
    const nav = await getNavData()
    setDisplayName(nav.displayName)
    setOverdueCount(nav.overdueCount)
    setInboundCount(nav.inboundCount)
    setAiEnabled(nav.aiEnabled)
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
        setOverdueCount(null)
        setInboundCount(0)
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
    setMenuOpen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Today asks for a fresh count after an item is cleared.
  useEffect(() => {
    const refresh = () => {
      navFetchedAt.current = Date.now()
      loadNavData()
    }
    window.addEventListener('cc:nav-refresh', refresh)
    return () => window.removeEventListener('cc:nav-refresh', refresh)
  }, [])

  // Close the user menu on an outside click.
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const openSearch = () => {
    setMobileOpen(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Don't show navigation on auth pages, onboarding, invite pages, or marketing pages
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/pricing' ||
    pathname === '/features' ||
    pathname?.startsWith('/auth/') ||
    pathname?.startsWith('/onboarding/') ||
    pathname?.startsWith('/invite/') ||
    pathname?.startsWith('/for/') ||
    pathname?.startsWith('/blog') ||
    pathname?.startsWith('/tools/') ||
    pathname?.startsWith('/terms') ||
    pathname?.startsWith('/privacy')
  ) {
    return null
  }

  if (isLoading) {
    return (
      <nav className="bg-brand-dark border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-serif)' }}>Correspondence Clerk</span>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  if (!user) {
    return null
  }

  // Three places (UI overhaul Stage 7): Today, Businesses, Inbox. Everything
  // else lives under the user menu.
  const places: { href: string; label: string; active: boolean; badge: number | null; badgeTitle?: string; badgeTone: string }[] = [
    {
      href: '/today',
      label: 'Today',
      active: pathname === '/today',
      badge: overdueCount && overdueCount > 0 ? overdueCount : null,
      badgeTitle: `${overdueCount} overdue`,
      badgeTone: 'bg-amber-500',
    },
    {
      href: '/businesses',
      label: 'Businesses',
      active: !!pathname?.startsWith('/businesses') || pathname === '/dashboard',
      badge: null,
      badgeTone: '',
    },
    {
      href: '/inbox',
      label: 'Inbox',
      active: pathname === '/inbox',
      badge: inboundCount > 0 ? inboundCount : null,
      badgeTitle: `${inboundCount} email${inboundCount === 1 ? '' : 's'} to file`,
      badgeTone: 'bg-red-500',
    },
  ]

  const menuItems: { href: string; label: string }[] = [
    { href: '/resources', label: 'Resources' },
    { href: '/search', label: 'Search page' },
    { href: '/dashboard', label: 'Old business list' },
    { href: '/import/gmail', label: 'Import emails' },
    { href: '/help', label: 'Help' },
    { href: '/settings', label: 'Settings' },
  ]

  // The CC Mastersheet, frozen as a read-only archive in Stage 9 (22 Oct 2026)
  const mastersheetUrl = 'https://docs.google.com/spreadsheets/d/1cwQkGrtMverl-KJ5_7VvmaNLPL9MYyNmNgBeGO-2rgA/edit'

  const badgeEl = (n: number, tone: string, title?: string) => (
    <span
      title={title}
      className={`min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center leading-none ${tone}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )

  return (
    <>
    <nav aria-label="Main navigation" className="bg-brand-dark border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link
              href="/today"
              className="text-xl font-bold text-white flex items-center gap-2"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              <span className="hidden lg:inline">Correspondence Clerk</span>
              <span className="lg:hidden">Clerk</span>
            </Link>

            <div className="hidden md:flex h-16">
              {places.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={p.active ? 'page' : undefined}
                  className={`px-4 flex items-center gap-2 text-sm font-medium transition-colors border-r border-white/20 ${
                    p.active ? 'text-white bg-brand-olive' : 'text-white hover:bg-brand-olive/20'
                  }`}
                >
                  {p.label}
                  {p.badge !== null && badgeEl(p.badge, p.badgeTone, p.badgeTitle)}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openSearch}
              className="hidden md:inline-flex items-center gap-2 text-sm text-white/90 border border-white/30 rounded-sm px-3 py-1.5 hover:bg-white/10 transition-colors"
            >
              Search <span className="text-xs text-white/60">Ctrl K</span>
            </button>
            <Link
              href="/new-entry"
              className={`hidden md:inline-flex text-sm font-semibold text-white rounded-sm px-3 py-1.5 transition-colors ${
                pathname === '/new-entry' ? 'bg-brand-olive ring-1 ring-white/60' : 'bg-brand-olive hover:bg-brand-olive/80'
              }`}
            >
              + New entry
            </Link>
            <div className="relative hidden md:block" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="text-left max-w-[180px] px-2 py-1 rounded-sm hover:bg-white/10 transition-colors"
              >
                <span className="block text-sm text-white truncate">
                  {displayName || user.email?.split('@')[0] || user.email} <span aria-hidden="true">▾</span>
                </span>
                {organization && <span className="block text-xs text-gray-400 truncate">{organization.name}</span>}
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-56 bg-white border border-black/[0.08] rounded-sm shadow-lg py-1">
                  {menuItems.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      role="menuitem"
                      className={`block px-4 py-2 text-sm hover:bg-brand-warm ${pathname === m.href ? 'text-brand-navy font-semibold' : 'text-brand-dark'}`}
                    >
                      {m.label}
                    </Link>
                  ))}
                  <a
                    href={mastersheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    className="block px-4 py-2 text-sm text-brand-dark hover:bg-brand-warm"
                  >
                    Mastersheet (archived)
                  </a>
                  {aiEnabled && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); toggleInsights() }}
                      className="block w-full text-left px-4 py-2 text-sm text-brand-dark hover:bg-brand-warm"
                    >
                      Insights
                    </button>
                  )}
                  <div className="border-t border-black/[0.06] my-1" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-brand-dark hover:bg-brand-warm"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
            {/* Menu button: mobile only */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Open menu"
              className="md:hidden text-sm font-medium text-white border border-white/30 rounded-sm px-3 py-1.5"
            >
              Menu
            </button>
          </div>
        </div>
      </div>

    </nav>

      {/* Mobile slide-out drawer */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="md:hidden fixed top-0 right-0 z-50 h-full w-72 max-w-[85vw] bg-brand-dark flex flex-col shadow-xl">
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/20">
              <span className="text-base font-semibold text-white" style={{ fontFamily: 'var(--font-serif)' }}>
                Menu
              </span>
              <button
                onClick={() => setMobileOpen(false)}
                className="px-2 py-1 text-sm text-white/80 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {places.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className={`flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors ${
                    p.active ? 'text-white bg-brand-olive' : 'text-white hover:bg-brand-olive/20'
                  }`}
                >
                  {p.label}
                  {p.badge !== null && badgeEl(p.badge, p.badgeTone)}
                </Link>
              ))}
              <button
                type="button"
                onClick={openSearch}
                className="block w-full text-left px-5 py-3 text-sm font-medium text-white hover:bg-brand-olive/20"
              >
                Search
              </button>
              <Link href="/new-entry" className="block px-5 py-3 text-sm font-medium text-white hover:bg-brand-olive/20">
                + New entry
              </Link>
              <div className="border-t border-white/20 my-2" />
              {menuItems.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`block px-5 py-3 text-sm transition-colors ${
                    pathname === m.href ? 'text-white bg-brand-olive' : 'text-white/80 hover:bg-brand-olive/20'
                  }`}
                >
                  {m.label}
                </Link>
              ))}
              <a
                href={mastersheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-5 py-3 text-sm text-white/80 hover:bg-brand-olive/20 transition-colors"
              >
                Mastersheet (archived)
              </a>
              {aiEnabled && (
                <button
                  type="button"
                  onClick={() => { setMobileOpen(false); toggleInsights() }}
                  className="block w-full text-left px-5 py-3 text-sm text-white/80 hover:bg-brand-olive/20"
                >
                  Insights
                </button>
              )}
            </div>
            <div className="border-t border-white/20 px-5 py-4">
              <p className="text-xs text-gray-400 truncate mb-3">
                {displayName || user.email?.split('@')[0] || user.email}
                {organization && ` · ${organization.name}`}
              </p>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-white hover:text-brand-olive transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}

      {/* Mobile bottom bar: the three places and the menu */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-brand-dark border-t border-white/20 flex">
        {places.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
              p.active ? 'text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            {p.label}
            {p.badge !== null && badgeEl(p.badge, p.badgeTone)}
          </Link>
        ))}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex-1 flex items-center justify-center py-3 text-xs font-medium text-white/60 hover:text-white transition-colors"
        >
          More
        </button>
      </div>
    </>
  )
}

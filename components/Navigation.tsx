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

/** The places kept in the phone's bottom bar. */
const BOTTOM_BAR = ['/today', '/businesses', '/inbox']

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
          <div className="flex items-center h-12">
            <span className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-serif)' }}>Correspondence Clerk</span>
          </div>
        </div>
        <div className="h-10 border-t border-white/10" />
      </nav>
    )
  }

  if (!user) {
    return null
  }

  // Tabs across the top (UI overhaul Stage 16, Tom's order): Today, Club Card,
  // Advertising, Newsletter, Outreach, Businesses, Inbox, Insights. A tab is
  // added here when it is built (Tom, 28 Oct: hide the rest until then).
  // Everything else lives under the user menu.
  const onClubCard = !!pathname?.startsWith('/club-card') || !!pathname?.startsWith('/businesses/club-card-pages')
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
      href: '/club-card',
      label: 'Club Card',
      active: onClubCard,
      badge: null,
      badgeTone: '',
    },
    {
      href: '/advertising',
      label: 'Advertising',
      active: pathname === '/advertising',
      badge: null,
      badgeTone: '',
    },
    {
      href: '/newsletter',
      label: 'Newsletter',
      active: pathname === '/newsletter',
      badge: null,
      badgeTone: '',
    },
    {
      href: '/outreach',
      label: 'Outreach',
      active: pathname === '/outreach',
      badge: null,
      badgeTone: '',
    },
    {
      href: '/businesses',
      label: 'Businesses',
      active: (!!pathname?.startsWith('/businesses') && !onClubCard) || pathname === '/dashboard',
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
    { href: '/data-health', label: 'Data health' },
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

  const tabLinks = (size: string) => places.map((p) => (
    <Link
      key={p.href}
      href={p.href}
      aria-current={p.active ? 'page' : undefined}
      className={`${size} shrink-0 flex items-center gap-2 text-sm font-medium transition-colors border-r border-white/20 whitespace-nowrap ${
        p.active ? 'text-white bg-brand-olive' : 'text-white hover:bg-brand-olive/20'
      }`}
    >
      {p.label}
      {p.badge !== null && badgeEl(p.badge, p.badgeTone, p.badgeTitle)}
    </Link>
  ))

  // Two slim rows (Stage 19, Tom 30 Oct: the tabs looked cramped in one row).
  // Top: logo, search box, + New entry, user menu. Second: the tabs, scrolling
  // sideways on narrow screens.
  return (
    <>
    <nav aria-label="Main navigation" className="bg-brand-dark border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 h-12">
          <Link
            href="/today"
            className="shrink-0 text-lg font-bold text-white"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            <span className="hidden sm:inline">Correspondence Clerk</span>
            <span className="sm:hidden">Clerk</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={openSearch}
              aria-label="Search (Ctrl K)"
              className="flex items-center justify-between gap-3 min-w-0 w-28 sm:w-56 lg:w-72 h-8 text-left text-sm text-white/70 bg-white/10 border border-white/20 rounded-sm px-3 hover:bg-white/15 hover:text-white transition-colors"
            >
              <span className="truncate">Search</span>
              <span className="hidden sm:inline shrink-0 text-xs text-white/50">Ctrl K</span>
            </button>
            <Link
              href="/new-entry"
              className={`hidden md:inline-flex items-center h-8 shrink-0 text-sm font-semibold text-white rounded-sm px-3 transition-colors ${
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
                className="text-left max-w-[180px] px-2 py-0.5 rounded-sm hover:bg-white/10 transition-colors"
              >
                <span className="block text-sm leading-tight text-white truncate">
                  {displayName || user.email?.split('@')[0] || user.email} <span aria-hidden="true">▾</span>
                </span>
                {organization && <span className="block text-xs leading-tight text-gray-400 truncate">{organization.name}</span>}
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
              className="md:hidden shrink-0 h-8 text-sm font-medium text-white border border-white/30 rounded-sm px-3"
            >
              Menu
            </button>
          </div>
        </div>
      </div>
      {/* Second row: the tabs */}
      <div className="border-t border-white/10 overflow-x-auto">
        <div className="max-w-7xl mx-auto px-0 sm:px-2 lg:px-4">
          <div className="flex min-w-max">{tabLinks('h-10 px-4 first:border-l')}</div>
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

      {/* Mobile bottom bar: the everyday places and the menu. Every tab is also in
          the scrolling strip under the header and in the menu (Stage 16d: seven
          tabs no longer fit here). */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-brand-dark border-t border-white/20 flex">
        {places.filter((p) => BOTTOM_BAR.includes(p.href)).map((p) => (
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

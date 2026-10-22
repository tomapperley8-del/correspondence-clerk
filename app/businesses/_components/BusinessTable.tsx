'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BusinessTable as TableData, TableRow } from '@/app/actions/business-table'
import type { ProspectLead } from '@/app/actions/leads'
import { ProspectBoard } from '@/components/pipeline/ProspectBoard'
import { MastersheetTable, type SortKey } from './MastersheetTable'
import { PipelineBoard } from '@/components/pipeline/PipelineBoards'
import type { ClubCardRow } from '@/app/actions/club-card'
import { ClubCardTable } from './ClubCardTable'

// The business table (UI overhaul Stage 5): Mastersheet-style, one row per
// business, with built-in views from the plan's Decisions plus views Tom saves
// himself (kept in this browser). Stage 7 adds Leads (prospect leads from the
// routine) and Outreach, and a board for Renewals and Outreach, replacing the
// To-dos Contracts and Outreach tabs. A Club Card view comes in Stage 6b.

type ViewKey = 'active' | 'attention' | 'renewals' | 'outreach' | 'leads' | 'club_card' | 'unreviewed' | 'prospects' | 'former' | 'internal' | 'everything'
type DealFilter = 'any' | 'club_card' | 'advertiser' | 'other' | 'none'

type Settings = {
  view: ViewKey
  q: string
  deal: DealFilter
  status: string
  type: string
  sort: SortKey
  dir: 'asc' | 'desc'
}

type SavedView = Settings & { name: string }

const VIEWS: { key: ViewKey; label: string; hint: string; sort: SortKey; dir: 'asc' | 'desc'; match: (r: TableRow) => boolean }[] = [
  {
    key: 'active',
    label: 'All active businesses',
    hint: 'A Club Card or advertising deal in force, or one that ended in the last 60 days and is not marked not renewing. Internal and community records are left out.',
    sort: 'name',
    dir: 'asc',
    match: (r) => r.is_active && r.is_commercial,
  },
  {
    key: 'attention',
    label: 'Needs attention',
    hint: 'The same businesses as the Needs attention page: money owed, renewals, emails waiting on you and to-dos. Snoozed ones are left out.',
    sort: 'attention',
    dir: 'asc',
    match: (r) => !!r.attention && !r.attention.is_snoozed,
  },
  {
    key: 'renewals',
    label: 'Renewals',
    hint: 'Club Card and advertising deals ending in the next 45 days or ended in the last 60, whatever their renewal stage.',
    sort: 'deal',
    dir: 'asc',
    match: (r) => r.in_renewal_window && r.is_commercial,
  },
  {
    key: 'outreach',
    label: 'Outreach',
    hint: 'Businesses in the outreach pipeline, at any stage. Switch to the board to move them between stages.',
    sort: 'last',
    dir: 'desc',
    match: (r) => !!r.outreach_stage,
  },
  {
    key: 'club_card',
    label: 'Club Card',
    hint: 'Every Club Card member and every business with a member page on the website: the page, its offer, when it was last edited, the card, the A-Z, map and category listings, contact details and news. Read from the website every night; fix the website yourself.',
    sort: 'name',
    dir: 'asc',
    match: () => false,
  },
  {
    key: 'leads',
    label: 'Leads',
    hint: 'Possible new business found by the prospecting routine. Not yet businesses on file: move each one along or reject it.',
    sort: 'name',
    dir: 'asc',
    match: () => false,
  },
  {
    key: 'unreviewed',
    label: 'Unreviewed',
    hint: 'New senders the email filing created, waiting for you to keep, hide or move them.',
    sort: 'last',
    dir: 'desc',
    match: (r) => r.status === 'Unreviewed',
  },
  {
    key: 'prospects',
    label: 'Prospects',
    hint: 'Businesses marked Prospect, without internal and community records.',
    sort: 'last',
    dir: 'desc',
    match: (r) => r.status === 'Prospect' && r.is_commercial,
  },
  {
    key: 'former',
    label: 'Former members',
    hint: 'Businesses marked Former, without internal and community records.',
    sort: 'deal',
    dir: 'desc',
    match: (r) => r.status === 'Former' && r.is_commercial,
  },
  {
    key: 'internal',
    label: 'Internal and community',
    hint: 'Records whose type is not commercial (Internal, Contributor, Community, Council, Media / PR). They stay out of the other views.',
    sort: 'name',
    dir: 'asc',
    match: (r) => !r.is_commercial,
  },
  {
    key: 'everything',
    label: 'Everything',
    hint: 'Every business on file except those hidden as not a business.',
    sort: 'name',
    dir: 'asc',
    match: () => true,
  },
]

const SAVED_KEY = 'business_table_saved_views'
const PAGE_SIZE = 200

function viewDef(key: ViewKey) {
  return VIEWS.find((v) => v.key === key) ?? VIEWS[0]
}

function defaults(view: ViewKey): Settings {
  const v = viewDef(view)
  return { view: v.key, q: '', deal: 'any', status: '', type: '', sort: v.sort, dir: v.dir }
}

function readSaved(): SavedView[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSaved(views: SavedView[]) {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(views))
  } catch {
    // Storage blocked: the view lasts until the page is closed.
  }
}

function dealLabel(value: string | null, labels: Map<string, string>): string {
  if (!value) return 'Deal'
  return labels.get(value) ?? (value === 'advertiser' ? 'Advertising' : value === 'club_card' ? 'Club Card' : value)
}

function dealGroup(r: TableRow): DealFilter {
  if (!r.deal) return 'none'
  if (r.deal.membership_type === 'club_card' || r.deal.membership_type === 'advertiser') return r.deal.membership_type
  return 'other'
}

function compare(a: TableRow, b: TableRow, sort: SortKey): number {
  const str = (x: string | null | undefined, y: string | null | undefined) => {
    // Blanks always go last, whichever way the column is sorted (handled by the caller).
    if (!x && !y) return 0
    if (!x) return 1
    if (!y) return -1
    return x.localeCompare(y, 'en-GB', { sensitivity: 'base' })
  }
  switch (sort) {
    case 'name':
      return str(a.name, b.name)
    case 'contact':
      return str(a.contact?.name, b.contact?.name)
    case 'deal':
      return str(a.deal?.contract_end, b.deal?.contract_end)
    case 'last':
      return str(a.last_in_touch, b.last_in_touch)
    case 'attention': {
      const pa = a.attention ? a.attention.priority : 99
      const pb = b.attention ? b.attention.priority : 99
      if (pa !== pb) return pa - pb
      return str(a.attention?.since, b.attention?.since)
    }
  }
}

function hasBlank(r: TableRow, sort: SortKey): boolean {
  switch (sort) {
    case 'name':
      return !r.name
    case 'contact':
      return !r.contact
    case 'deal':
      return !r.deal?.contract_end
    case 'last':
      return !r.last_in_touch
    case 'attention':
      return !r.attention
  }
}

const BOARD_VIEWS: ViewKey[] = ['renewals', 'outreach']

export function BusinessTable({ data, initialView, initialQuery, initialBoard, leads, leadsError, clubCard }: {
  data: TableData
  initialView?: string
  initialQuery?: string
  initialBoard?: boolean
  leads: ProspectLead[]
  leadsError?: string
  clubCard: { rows: ClubCardRow[]; lastRun: { ran_at: string; ok: boolean } | null; toMatch: number; error?: string }
}) {
  const { today, rows } = data

  const [settings, setSettings] = useState<Settings>(() => {
    const view = VIEWS.some((v) => v.key === initialView) ? (initialView as ViewKey) : 'active'
    return { ...defaults(view), q: initialQuery ?? '' }
  })
  const [saved, setSaved] = useState<SavedView[]>([])
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [board, setBoard] = useState(!!initialBoard)

  useEffect(() => {
    // Saved views live in this browser only; read after mount so the server render matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(readSaved())
  }, [])

  // Keep the view and search in the address, so a view can be bookmarked or shared.
  useEffect(() => {
    const params = new URLSearchParams()
    if (settings.view !== 'active') params.set('view', settings.view)
    if (settings.q) params.set('q', settings.q)
    if (board && BOARD_VIEWS.includes(settings.view)) params.set('board', '1')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [settings.view, settings.q, board])

  const membershipLabels = useMemo(() => new Map(data.membershipTypes.map((t) => [t.value, t.label])), [data.membershipTypes])
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status).filter((s): s is string => !!s))].sort(), [rows])

  const counts = useMemo(() => {
    const c = {} as Record<ViewKey, number>
    for (const v of VIEWS) c[v.key] = rows.filter(v.match).length
    c.leads = leads.filter((l) => l.status === 'new' || l.status === 'reviewing').length
    c.club_card = clubCard.rows.length
    return c
  }, [rows, leads, clubCard.rows])
  const allBusinessNames = useMemo(() => rows.map((r) => ({ id: r.id, name: r.name })), [rows])

  const shown = useMemo(() => {
    const view = viewDef(settings.view)
    const q = settings.q.trim().toLowerCase()
    const list = rows.filter((r) => {
      if (!view.match(r)) return false
      if (settings.deal !== 'any' && dealGroup(r) !== settings.deal) return false
      if (settings.status && (r.status ?? '') !== (settings.status === '(none)' ? '' : settings.status)) return false
      if (settings.type && (r.business_type ?? '') !== (settings.type === '(none)' ? '' : settings.type)) return false
      if (q) {
        const hay = [r.name, r.contact?.name, r.contact?.email, r.contact?.role, r.last_subject, r.business_type_label]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const sign = settings.dir === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      const blankA = hasBlank(a, settings.sort)
      const blankB = hasBlank(b, settings.sort)
      if (blankA !== blankB) return blankA ? 1 : -1
      return sign * compare(a, b, settings.sort) || a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' })
    })
  }, [rows, settings])

  const update = (patch: Partial<Settings>) => {
    setLimit(PAGE_SIZE)
    setSettings((s) => ({ ...s, ...patch }))
  }

  // A filter searches every business: inside a view it could only ever narrow it
  // (Status: Former within All active found nothing), so it moves to Everything.
  const filterBy = (patch: Partial<Settings>) => update({ ...patch, view: 'everything' })

  const chooseView = (key: ViewKey) => {
    setLimit(PAGE_SIZE)
    setSettings((s) => ({ ...defaults(key), q: s.q }))
  }

  const sortBy = (key: SortKey) => {
    if (settings.sort === key) update({ dir: settings.dir === 'asc' ? 'desc' : 'asc' })
    else update({ sort: key, dir: key === 'last' ? 'desc' : 'asc' })
  }

  const saveView = () => {
    const name = newName.trim()
    if (!name) return
    const next = [...saved.filter((v) => v.name !== name), { ...settings, name }]
    setSaved(next)
    writeSaved(next)
    setNaming(false)
    setNewName('')
  }

  const removeView = (name: string) => {
    const next = saved.filter((v) => v.name !== name)
    setSaved(next)
    writeSaved(next)
  }

  const filtersSet = settings.deal !== 'any' || !!settings.status || !!settings.type
  const view = viewDef(settings.view)
  const mode: 'table' | 'board' | 'leads' | 'club_card' =
    settings.view === 'leads' ? 'leads' : settings.view === 'club_card' ? 'club_card' : board && BOARD_VIEWS.includes(settings.view) ? 'board' : 'table'

  return (
    <div>
      {/* Views */}
      <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => chooseView(v.key)}
            aria-pressed={settings.view === v.key}
            className={`px-3 py-1.5 text-sm border rounded-sm transition-colors duration-200 ease-out ${
              settings.view === v.key
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-white text-gray-800 border-black/10 hover:border-brand-navy'
            }`}
          >
            {v.label} <span className={settings.view === v.key ? 'text-white/80' : 'text-gray-500'}>{counts[v.key]}</span>
          </button>
        ))}
      </div>
      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
          <span className="text-gray-500">Your views:</span>
          {saved.map((v) => (
            <span key={v.name} className="inline-flex items-center border border-black/10 rounded-sm bg-white">
              <button
                type="button"
                onClick={() => {
                  setLimit(PAGE_SIZE)
                  setSettings({ view: v.view, q: v.q, deal: v.deal, status: v.status, type: v.type, sort: v.sort, dir: v.dir })
                }}
                className="px-2.5 py-1 hover:text-brand-navy"
              >
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => removeView(v.name)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-red-700 border-l border-black/10"
                aria-label={`Remove the view ${v.name}`}
              >
                Remove
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 mb-4">{view.hint}</p>

      {BOARD_VIEWS.includes(settings.view) && (
        <div className="inline-flex mb-4 border border-black/10 rounded-sm overflow-hidden" role="group" aria-label="Show as">
          {([['table', 'Table'], ['board', 'Board']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={(key === 'board') === board}
              onClick={() => setBoard(key === 'board')}
              className={`px-3 py-1.5 text-sm transition-colors duration-200 ease-out ${
                (key === 'board') === board ? 'bg-brand-navy text-white' : 'bg-white text-gray-800 hover:bg-brand-warm'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'leads' && (
        leadsError ? (
          <p className="text-sm text-red-700">Could not load the leads: {leadsError}</p>
        ) : leads.length === 0 ? (
          <p className="text-sm text-gray-500">No leads yet. The prospecting routine adds them here when it finds something.</p>
        ) : (
          <ProspectBoard initialLeads={leads} />
        )
      )}

      {mode === 'club_card' && (
        clubCard.error
          ? <p className="text-sm text-red-700">Could not load the Club Card view: {clubCard.error}</p>
          : <ClubCardTable rows={clubCard.rows} lastRun={clubCard.lastRun} toMatch={clubCard.toMatch} />
      )}

      {mode === 'board' && <PipelineBoard kind={settings.view === 'outreach' ? 'outreach' : 'renewals'} allBusinessNames={allBusinessNames} />}

      {mode === 'table' && (<>

      {/* Search and filters */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="flex-1 min-w-[220px]">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Search</span>
          <input
            type="search"
            value={settings.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Business, contact, email or subject"
            className="w-full px-3 py-2 text-sm border border-black/10 rounded-sm bg-white focus:outline-none focus:border-brand-navy"
          />
        </label>
        <label>
          <span className="block text-xs font-semibold text-gray-600 mb-1">Deal</span>
          <select
            value={settings.deal}
            onChange={(e) => filterBy({ deal: e.target.value as DealFilter })}
            className="px-2 py-2 text-sm border border-black/10 rounded-sm bg-white"
          >
            <option value="any">Any</option>
            <option value="club_card">{dealLabel('club_card', membershipLabels)}</option>
            <option value="advertiser">{dealLabel('advertiser', membershipLabels)}</option>
            <option value="other">Other or former</option>
            <option value="none">No deal on file</option>
          </select>
        </label>
        <label>
          <span className="block text-xs font-semibold text-gray-600 mb-1">Status</span>
          <select
            value={settings.status}
            onChange={(e) => filterBy({ status: e.target.value })}
            className="px-2 py-2 text-sm border border-black/10 rounded-sm bg-white"
          >
            <option value="">Any</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="(none)">No status</option>
          </select>
        </label>
        <label>
          <span className="block text-xs font-semibold text-gray-600 mb-1">Type</span>
          <select
            value={settings.type}
            onChange={(e) => filterBy({ type: e.target.value })}
            className="px-2 py-2 text-sm border border-black/10 rounded-sm bg-white"
          >
            <option value="">Any</option>
            {data.businessTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
            <option value="(none)">No type</option>
          </select>
        </label>
        {filtersSet && (
          <button
            type="button"
            onClick={() => update({ deal: 'any', status: '', type: '' })}
            className="px-3 py-2 text-sm text-gray-700 hover:text-brand-navy"
          >
            Clear filters
          </button>
        )}
        {naming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveView()
            }}
            className="flex items-end gap-2"
          >
            <label>
              <span className="block text-xs font-semibold text-gray-600 mb-1">Name for this view</span>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
                className="px-3 py-2 text-sm border border-black/10 rounded-sm bg-white focus:outline-none focus:border-brand-navy"
              />
            </label>
            <button type="submit" disabled={!newName.trim()} className="px-3 py-2 text-sm bg-brand-navy text-white rounded-sm hover:bg-brand-navy-hover disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => setNaming(false)} className="px-3 py-2 text-sm text-gray-700 hover:text-brand-navy">
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="px-3 py-2 text-sm border border-black/10 rounded-sm bg-white hover:border-brand-navy"
          >
            Save this view
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600 mb-2">
        {shown.length} {shown.length === 1 ? 'business' : 'businesses'}
      </p>

      <MastersheetTable
        rows={shown.slice(0, limit)}
        today={today}
        membershipLabels={membershipLabels}
        sort={settings.sort}
        dir={settings.dir}
        onSort={sortBy}
        emptyText={`No businesses match.${settings.q || filtersSet ? ' Try clearing the search or filters.' : ''}`}
      />
      {shown.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE_SIZE)}
          className="mt-3 px-4 py-2 text-sm border border-black/10 rounded-sm bg-white hover:border-brand-navy"
        >
          Show {Math.min(PAGE_SIZE, shown.length - limit)} more ({shown.length - limit} not shown)
        </button>
      )}
      </>)}
    </div>
  )
}

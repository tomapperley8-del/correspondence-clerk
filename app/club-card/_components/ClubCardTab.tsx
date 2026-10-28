'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn, formatDateGB } from '@/lib/utils'
import type { ClubCardTabRow, ClubCardSummary } from '@/app/actions/club-card-tab'
import { getClubCardForBusiness, setClubCardOffer, type ClubCardArticle } from '@/app/actions/club-card'
import { getTodayDetail, type TodayDetail } from '@/app/actions/today'
import { CARD_STATE_LABEL, ISSUE_LABEL, type ClubCardIssue } from '@/lib/club-card/labels'
import { ActionMenu, type MenuEntry } from '@/components/ui/action-menu'
import { FilterChips } from '@/components/ui/filter-chips'
import { FullScreenPanel } from '@/components/ui/full-screen-panel'
import { ResizableSplit } from '@/components/ui/resizable-split'
import { PipelineBoard } from '@/components/pipeline/PipelineBoards'
import { ColumnChooser } from '@/app/businesses/_components/ColumnChooser'
import { RENEWAL_STAGE_LABEL } from '@/app/businesses/_components/MastersheetTable'
import { downloadSheet } from '@/lib/spreadsheet-export'

// The Club Card tab (UI overhaul Stage 16b, layout A, Tom's pick on 28 Oct):
// a summary across the top, one members list with filter chips and a detail
// panel beside it (Today v2's pattern), and the Renewals board for Club Card
// members. Former members have their own chip (Tom, 28 Oct). Nothing here
// writes to the website; the only changes are the offer checks that the
// business page already had, and the renewal board's stage moves.

type Show = 'members' | 'renewals' | 'problems' | 'lapsed' | 'no_card' | 'due' | 'former' | 'all'

const SHOWS: { key: Show; label: string; hint: string }[] = [
  { key: 'members', label: 'Members', hint: 'A Club Card in force, or ended in the last 60 days (the grace period).' },
  { key: 'renewals', label: 'Renewals', hint: 'Cards ending in the next 45 days or ended in the last 60, whatever their renewal stage. Switch to the board to move them along.' },
  { key: 'problems', label: 'Website problems', hint: 'Anything wrong with the member page: no page, offer out of date, missing from the A-Z, map or a category, listed twice, or details that differ.' },
  { key: 'lapsed', label: 'Card ended, page live', hint: 'The card has ended but the page is still on the website. Chase the renewal or take the page down.' },
  { key: 'no_card', label: 'Page, no card', hint: 'A member page on the website for a business with no Club Card on file.' },
  { key: 'due', label: 'Due a mention', hint: 'Members not in the newsletter for six months, or never.' },
  { key: 'former', label: 'Former members', hint: 'Businesses that had a Club Card which ended more than 60 days ago.' },
  { key: 'all', label: 'Everything', hint: 'Members, former members and every business with a member page.' },
]

type Col = 'card' | 'ends' | 'amount' | 'offer' | 'page' | 'contact' | 'last' | 'newsletter' | 'news' | 'renewal' | 'terms' | 'problems'
const COLS: { key: Col; label: string }[] = [
  { key: 'card', label: 'Card' },
  { key: 'ends', label: 'Ends' },
  { key: 'amount', label: 'Amount' },
  { key: 'offer', label: 'Offer' },
  { key: 'page', label: 'Website page' },
  { key: 'contact', label: 'Main contact' },
  { key: 'last', label: 'Last in touch' },
  { key: 'newsletter', label: 'Last in newsletter' },
  { key: 'news', label: 'News articles' },
  { key: 'renewal', label: 'Renewal stage' },
  { key: 'terms', label: 'Terms' },
  { key: 'problems', label: 'Problems' },
]
const DEFAULT_COLS: Col[] = ['card', 'ends', 'amount', 'offer', 'page', 'contact', 'last', 'newsletter', 'problems']
const COLS_KEY = 'cc.clubcard.columns'

const btnBase =
  'inline-flex items-center justify-center text-sm font-semibold px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const mainBtn = `${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`
const softBtn = `${btnBase} bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm`

const dateGB = (d: string | null | undefined) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')
const moneyGB = (n: number | null | undefined) => (n === null || n === undefined ? '' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`)

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const CARD_PILL: Record<ClubCardTabRow['card_state'], { text: string; cls: string }> = {
  member: { text: 'Member', cls: 'bg-ms-clubcard text-white' },
  grace: { text: 'Grace', cls: 'bg-ms-yellow text-ms-yellow-text' },
  lapsed: { text: 'Ended', cls: 'bg-ms-red text-ms-red-text' },
  none: { text: 'No card', cls: 'bg-ms-muted text-ms-muted-text' },
  former: { text: 'Former', cls: 'bg-ms-former text-ms-former-text' },
}
const STATE_WORDS: Record<ClubCardTabRow['card_state'], string> = { ...CARD_STATE_LABEL, former: 'Former member: the card ended more than 60 days ago' } as Record<ClubCardTabRow['card_state'], string>

function issueText(r: ClubCardTabRow, i: ClubCardIssue) {
  return i === 'offer_ending' && r.member?.offer_ends ? `Offer ends ${dateGB(r.member.offer_ends)}` : ISSUE_LABEL[i]
}

function endTone(r: ClubCardTabRow, today: string) {
  const end = r.contract?.contract_end
  if (!end || r.card_state === 'former') return ''
  if (end < today) return 'text-ms-red-text font-semibold'
  if (end <= addDaysISO(today, 31)) return 'text-ms-orange-text font-semibold'
  return ''
}

function contactName(r: ClubCardTabRow) {
  const c = r.table?.contact
  if (!c || c.is_placeholder) return ''
  return c.role ? `${c.name} (${c.role})` : c.name
}

function cellText(r: ClubCardTabRow, col: Col): string {
  const m = r.member
  switch (col) {
    case 'card': return CARD_PILL[r.card_state].text
    case 'ends': return dateGB(r.contract?.contract_end)
    case 'amount': return moneyGB(r.contract?.contract_amount)
    case 'offer': return m?.offer_text?.replace(/\s+/g, ' ').trim() ?? ''
    case 'page': return m?.page_link ?? ''
    case 'contact': return contactName(r)
    case 'last': return dateGB(r.table?.last_in_touch)
    case 'newsletter': return dateGB(r.table?.newsletter?.date)
    case 'news': return m && 'articles' in m ? String((m as { articles: number }).articles) : ''
    case 'renewal': return r.table?.in_renewal_window && r.table.renewal_stage ? RENEWAL_STAGE_LABEL[r.table.renewal_stage] ?? r.table.renewal_stage : ''
    case 'terms': return String(r.terms)
    case 'problems': return (m?.issues ?? []).map((i) => issueText(r, i)).join('; ')
  }
}

function readCols(): Col[] | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(COLS_KEY) ?? 'null')
    return Array.isArray(v) ? v.filter((c): c is Col => COLS.some((d) => d.key === c)) : null
  } catch {
    return null
  }
}

export function ClubCardTab({ data, initialShow, initialBusiness, initialQuery }: {
  data: { today: string; rows: ClubCardTabRow[]; summary: ClubCardSummary; dueMentionIds: string[]; lastRun: { ran_at: string; ok: boolean } | null; toMatch: number }
  initialShow?: string
  initialBusiness?: string
  initialQuery?: string
}) {
  const { today, rows, summary, lastRun, toMatch } = data
  const due = useMemo(() => new Set(data.dueMentionIds), [data.dueMentionIds])
  const startRow = initialBusiness ? rows.find((r) => r.business_id === initialBusiness) : undefined
  const [show, setShow] = useState<Show>(() => {
    if (SHOWS.some((s) => s.key === initialShow)) return initialShow as Show
    if (startRow?.card_state === 'former') return 'former'
    if (startRow?.card_state === 'none') return 'no_card'
    return 'members'
  })
  const [board, setBoard] = useState(initialShow === 'board')
  const [q, setQ] = useState(initialQuery ?? '')
  const [selected, setSelected] = useState<string | null>(startRow?.business_id ?? null)
  const [cols, setCols] = useState<Col[]>(DEFAULT_COLS)

  useEffect(() => {
    const saved = readCols()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of a saved preference on mount
    if (saved && saved.length > 0) setCols(saved)
  }, [])
  const changeCols = (next: Col[] | null) => {
    setCols(next ?? DEFAULT_COLS)
    try {
      if (next) window.localStorage.setItem(COLS_KEY, JSON.stringify(next))
      else window.localStorage.removeItem(COLS_KEY)
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
  }

  // Keep the chip, board and chosen business in the address, so it can be bookmarked or shared.
  useEffect(() => {
    const params = new URLSearchParams()
    if (board) params.set('show', 'board')
    else if (show !== 'members') params.set('show', show)
    if (q) params.set('q', q)
    if (selected) params.set('b', selected)
    const s = params.toString()
    window.history.replaceState(null, '', s ? `/club-card?${s}` : '/club-card')
  }, [show, board, q, selected])

  const match = useCallback((r: ClubCardTabRow, s: Show) => {
    const issues = r.member?.issues ?? []
    switch (s) {
      case 'members': return r.card_state === 'member' || r.card_state === 'grace'
      case 'renewals': return r.card_state !== 'former' && r.card_state !== 'none' && !!r.table?.in_renewal_window
      case 'problems': return issues.length > 0
      case 'lapsed': return issues.includes('page_lapsed')
      case 'no_card': return r.card_state === 'none'
      case 'due': return due.has(r.business_id)
      case 'former': return r.card_state === 'former'
      case 'all': return true
    }
  }, [due])

  const counts = useMemo(() => {
    const c = {} as Record<Show, number>
    for (const s of SHOWS) c[s.key] = rows.filter((r) => match(r, s.key)).length
    return c
  }, [rows, match])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => match(r, show) && (!needle || r.name.toLowerCase().includes(needle) || (r.member?.offer_text ?? '').toLowerCase().includes(needle)))
  }, [rows, show, q, match])

  const current = shown.find((r) => r.business_id === selected) ?? shown[0] ?? null
  const allBusinessNames = useMemo(() => rows.map((r) => ({ id: r.business_id, name: r.name })), [rows])
  const showDef = SHOWS.find((s) => s.key === show)!

  function choose(s: Show) {
    setBoard(false)
    setShow(s)
  }

  function download(format: 'csv' | 'xlsx') {
    downloadSheet(
      {
        name: 'Club Card',
        header: ['Business', ...cols.map((c) => COLS.find((d) => d.key === c)!.label)],
        rows: shown.map((r) => [r.name, ...cols.map((c) => cellText(r, c))]),
      },
      `club-card-${show}-${today}`,
      format,
    )
  }

  const tiles: { label: string; value: string; sub?: string; show?: Show; board?: boolean; warn?: boolean }[] = [
    { label: 'Members now', value: String(summary.members), sub: summary.grace ? `and ${summary.grace} in the grace period` : undefined, show: 'members' },
    { label: 'Renewals', value: `${summary.endingThisMonth} · ${summary.endingNextMonth}`, sub: `ending in ${summary.thisMonthLabel} · ${summary.nextMonthLabel}`, board: true },
    { label: `Income ${summary.year}`, value: moneyGB(summary.incomeThisYear), sub: `Club Card deals started in ${summary.year}` },
    { label: 'Website problems', value: String(summary.withProblems), sub: 'pages to fix', show: 'problems', warn: summary.withProblems > 0 },
    { label: 'Due a mention', value: String(summary.dueMention), sub: 'not in the newsletter for 6 months', show: 'due' },
  ]

  return (
    <div>
      {/* Summary across the top: each box opens its list */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 mb-4">
        {tiles.map((t) => {
          const body = (
            <>
              <span className={cn('block text-2xl font-bold tabular-nums', t.warn ? 'text-ms-red-text' : 'text-brand-dark')}>{t.value}</span>
              <span className="block text-xs font-semibold text-gray-700">{t.label}</span>
              {t.sub && <span className="block text-xs text-gray-600">{t.sub}</span>}
            </>
          )
          const cls = 'text-left bg-white border border-black/[0.06] rounded-sm px-3 py-2 shadow-[var(--shadow-sm)]'
          return t.show || t.board ? (
            <button
              key={t.label}
              type="button"
              onClick={() => (t.board ? (setShow('renewals'), setBoard(true)) : choose(t.show!))}
              className={cn(cls, 'hover:border-black/[0.16] transition-colors duration-200 ease-out')}
            >
              {body}
              <span className="sr-only">, show {t.board ? 'the renewals board' : 'this list'}</span>
            </button>
          ) : (
            <div key={t.label} className={cls}>{body}</div>
          )
        })}
      </div>

      <FullScreenPanel
        title={board ? 'Club Card renewals' : showDef.label}
        headingId="club-card-heading"
        card={false}
        controls={
          board ? null : (
            <>
              <ColumnChooser<Col> columns={cols} onChange={changeCols} defs={COLS} defaults={DEFAULT_COLS} />
              <ActionMenu
                label="Download"
                accessibleLabel={`Download ${shown.length} rows in this list`}
                className="text-brand-navy"
                entries={[
                  { label: 'Excel (.xlsx)', hint: 'The rows and columns shown, all of them', onSelect: () => download('xlsx') },
                  { label: 'CSV', hint: 'Opens in Excel, Numbers or Google Sheets', onSelect: () => download('csv') },
                ]}
              />
            </>
          )
        }
      >
        {(full) => (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <FilterChips label="Show" value={board ? ('' as Show) : show} onChange={choose} chips={SHOWS.map((s) => ({ key: s.key, label: s.label, count: counts[s.key] }))} />
              <button
                type="button"
                aria-pressed={board}
                onClick={() => setBoard((b) => !b)}
                className={cn(
                  'inline-flex items-center text-xs font-semibold px-2.5 min-h-10 md:min-h-7 pointer-coarse:min-h-10 rounded-full border transition-colors duration-200 ease-out whitespace-nowrap',
                  board ? 'bg-ms-band border-ms-band text-white' : 'bg-white border-ms-band/40 text-ms-band hover:border-ms-band',
                )}
              >
                Renewals board
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-gray-600">
              <span>{board ? 'Club Card members in the renewal window. Advertisers are on the Renewals board in Businesses.' : showDef.hint}</span>
              <span>{lastRun ? `Website last read ${new Date(lastRun.ran_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}${lastRun.ok ? '' : ' (failed)'}` : 'The website has not been read yet'}</span>
              <Link href="/businesses/club-card-pages" className="font-semibold text-brand-navy hover:underline">
                {toMatch > 0 ? `${toMatch} page${toMatch === 1 ? '' : 's'} to match` : 'Page matches'}
              </Link>
            </div>

            {board ? (
              <PipelineBoard kind="renewals" only="club_card" allBusinessNames={allBusinessNames} />
            ) : (
              <>
                <label className="block mb-2 max-w-sm">
                  <span className="sr-only">Search the list</span>
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search names and offers"
                    className="w-full text-sm border border-black/[0.12] rounded-sm px-2 min-h-10 md:min-h-8 bg-white"
                  />
                </label>
                {shown.length === 0 ? (
                  <p className="text-sm text-gray-600 py-6">Nothing in this list{q ? ' matches the search' : ''}.</p>
                ) : (
                  <>
                    {/* Wide screens: the table and the panel side by side */}
                    <div className="hidden lg:block">
                      <ResizableSplit
                        storageKey="cc.clubcard.split"
                        defaultPercent={64}
                        label="Resize the list and the detail panel"
                        first={<MembersTable rows={shown} cols={cols} today={today} selected={current?.business_id ?? null} onSelect={setSelected} tall={full} />}
                        second={current ? (
                          <div className="bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)] p-4 lg:sticky lg:top-4">
                            <MemberPanel key={current.business_id} row={current} today={today} due={due.has(current.business_id)} />
                          </div>
                        ) : null}
                      />
                    </div>
                    {/* Phones and narrow windows: cards, the chosen one opens in place */}
                    <ul className="lg:hidden divide-y divide-ms-grid border-y border-ms-grid bg-white">
                      {shown.map((r) => {
                        const open = r.business_id === current?.business_id && selected === r.business_id
                        return (
                          <li key={r.business_id}>
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => setSelected(open ? null : r.business_id)}
                              className={cn('w-full text-left px-3 py-2.5 min-h-12', open ? 'bg-ms-blue/50' : 'hover:bg-brand-warm')}
                            >
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold text-brand-dark">{r.name}</span>
                                <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-full', CARD_PILL[r.card_state].cls)}>{CARD_PILL[r.card_state].text}</span>
                                {r.contract?.contract_end && <span className={cn('text-xs', endTone(r, today) || 'text-gray-600')}>{r.card_state === 'former' ? 'ended' : 'ends'} {dateGB(r.contract.contract_end)}</span>}
                              </span>
                              <span className="text-xs text-gray-600 mt-0.5 line-clamp-1">
                                {[r.member?.offer_text?.replace(/\s+/g, ' '), contactName(r), r.table?.last_in_touch ? `in touch ${dateGB(r.table.last_in_touch)}` : null].filter(Boolean).join(' · ')}
                              </span>
                              {(r.member?.issues.length ?? 0) > 0 && (
                                <span className="flex flex-wrap gap-1 mt-1">
                                  {r.member!.issues.map((i) => <span key={i} className="text-[11px] font-semibold px-1.5 py-0.5 rounded-sm bg-ms-orange text-ms-orange-text">{issueText(r, i)}</span>)}
                                </span>
                              )}
                            </button>
                            {open && (
                              <div className="px-3 pb-4 pt-1 bg-white">
                                <MemberPanel row={r} today={today} due={due.has(r.business_id)} inline />
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
                <p className="text-xs text-gray-600 mt-2">
                  {shown.length} {shown.length === 1 ? 'row' : 'rows'}. Dates in <span className="text-ms-red-text font-semibold">red</span> have passed; <span className="text-ms-orange-text font-semibold">orange</span> end within a month. A name opens the business page; the business page links back here.
                </p>
              </>
            )}
          </>
        )}
      </FullScreenPanel>
    </div>
  )
}

function MembersTable({ rows, cols, today, selected, onSelect, tall }: {
  rows: ClubCardTabRow[]
  cols: Col[]
  today: string
  selected: string | null
  onSelect: (id: string) => void
  tall: boolean
}) {
  return (
    <div className={cn('overflow-auto border border-ms-grid rounded-sm bg-white', tall ? 'max-h-[calc(100vh-14rem)]' : 'max-h-[75vh]')}>
      <table className="w-full text-[13px] border-collapse">
        <caption className="sr-only">Club Card list. Choose a row to see it in the panel.</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 left-0 z-20 bg-ms-header text-white text-left font-semibold px-2 py-1.5 whitespace-nowrap">Business</th>
            {cols.map((c) => (
              <th key={c} scope="col" className="sticky top-0 z-10 bg-ms-header text-white text-left font-semibold px-2 py-1.5 whitespace-nowrap">
                {COLS.find((d) => d.key === c)!.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = r.business_id === selected
            return (
              <tr
                key={r.business_id}
                aria-selected={on}
                onClick={() => onSelect(r.business_id)}
                className={cn('cursor-pointer border-t border-ms-grid align-top', on ? 'bg-ms-blue' : 'hover:bg-brand-warm')}
              >
                <th scope="row" className={cn('sticky left-0 z-[5] text-left font-semibold px-2 py-1.5 whitespace-nowrap', on ? 'bg-ms-blue' : 'bg-white')}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSelect(r.business_id) }}
                    aria-pressed={on}
                    className="text-left text-brand-dark hover:underline min-h-8"
                  >
                    {r.name}
                    <span className="sr-only">, show in the panel</span>
                  </button>
                </th>
                {cols.map((c) => <td key={c} className="px-2 py-1.5">{cell(r, c, today)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function cell(r: ClubCardTabRow, c: Col, today: string): React.ReactNode {
  const m = r.member
  switch (c) {
    case 'card':
      return <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap', CARD_PILL[r.card_state].cls)}>{CARD_PILL[r.card_state].text}</span>
    case 'ends':
      return <span className={cn('whitespace-nowrap tabular-nums', endTone(r, today))}>{dateGB(r.contract?.contract_end)}</span>
    case 'amount':
      return <span className="whitespace-nowrap tabular-nums">{moneyGB(r.contract?.contract_amount)}</span>
    case 'offer':
      return <span title={m?.offer_text ?? undefined} className="max-w-[16rem] min-w-[10rem] line-clamp-2 text-gray-700">{m?.offer_text?.replace(/\s+/g, ' ')}</span>
    case 'page':
      return m?.page_link ? (
        <a href={m.page_link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-navy hover:underline whitespace-nowrap">
          Page<span className="sr-only"> for {r.name} (opens the website)</span>
        </a>
      ) : <span className="text-gray-500 whitespace-nowrap">{r.card_state === 'former' ? '' : 'None'}</span>
    case 'contact':
      return <span className="whitespace-nowrap">{contactName(r)}</span>
    case 'last':
      return <span className="whitespace-nowrap tabular-nums">{dateGB(r.table?.last_in_touch)}</span>
    case 'newsletter':
      return r.table?.newsletter ? (
        r.table.newsletter.url ? (
          <a href={r.table.newsletter.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-navy hover:underline whitespace-nowrap tabular-nums">
            {dateGB(r.table.newsletter.date)}<span className="sr-only"> (opens the issue)</span>
          </a>
        ) : <span className="whitespace-nowrap tabular-nums">{dateGB(r.table.newsletter.date)}</span>
      ) : <span className="text-gray-500">Never</span>
    case 'problems':
      return (m?.issues.length ?? 0) > 0 ? (
        <span className="flex flex-wrap gap-1">
          {m!.issues.map((i) => <span key={i} className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap', i === 'page_lapsed' ? 'bg-ms-red text-ms-red-text' : 'bg-ms-orange text-ms-orange-text')}>{issueText(r, i)}</span>)}
        </span>
      ) : null
    default:
      return cellText(r, c)
  }
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-gray-600">{term}</dt>
      <dd className="text-brand-dark min-w-0 break-words">{children}</dd>
    </>
  )
}

function MemberPanel({ row, today, due, inline = false }: { row: ClubCardTabRow; today: string; due: boolean; inline?: boolean }) {
  const router = useRouter()
  const [detail, setDetail] = useState<TodayDetail | 'loading' | 'error'>('loading')
  const [articles, setArticles] = useState<ClubCardArticle[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [picking, setPicking] = useState(false)
  const m = row.member
  const biz = `/businesses/${row.business_id}`

  // Answers count while this business is still the one shown (see PipelineBoard
  // for why this is not a per-run flag).
  const showing = useRef<string | null>(null)
  useEffect(() => {
    const id = row.business_id
    showing.current = id
    const live = () => showing.current === id
    getTodayDetail(id).then((r) => { if (live()) setDetail(r.data ?? 'error') }).catch(() => { if (live()) setDetail('error') })
    getClubCardForBusiness(id).then((r) => { if (live()) setArticles(r.articles) }).catch(() => { if (live()) setArticles([]) })
    return () => { showing.current = null }
  }, [row.business_id])

  const loaded = detail !== 'loading' && detail !== 'error' ? detail : null
  const unpaid = (loaded?.glance.invoices ?? []).filter((v) => (v.balance ?? 0) > 0 && !v.voided_at)
  const c = row.contract
  const Heading = inline ? 'h3' : 'h2'

  async function offer(change: { confirm?: boolean; offer_ends_set?: string | null }, done: string) {
    if (!m?.page_id) return
    setBusy(true)
    const r = await setClubCardOffer(m.page_id, change)
    setBusy(false)
    if (r.error) {
      toast.error(r.error)
      return
    }
    toast.success(done)
    setPicking(false)
    window.dispatchEvent(new Event('cc:nav-refresh'))
    router.refresh()
  }

  const email = loaded?.contact?.emails[0]
  const more: MenuEntry[] = [
    { label: 'Log an email or call', href: `/new-entry?businessId=${row.business_id}` },
    ...(m?.page_link ? [{ label: 'Open the website page', href: m.page_link, external: true }] : []),
    ...(email ? [{ label: 'Email the main contact', hint: email, href: `mailto:${email}`, external: true }] : []),
    { label: 'Club Card on the business page', href: `${biz}#club-card` },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading className={inline ? 'text-lg font-semibold text-brand-dark' : 'text-[1.6rem] leading-tight font-semibold text-brand-dark'} style={inline ? undefined : { fontFamily: 'var(--font-serif)' }}>
            <Link href={biz} className="hover:underline">{row.name}</Link>
          </Heading>
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', CARD_PILL[row.card_state].cls)}>{CARD_PILL[row.card_state].text}</span>
          {row.table?.deal_types_in_force.includes('advertiser') && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-ms-advertiser text-ms-advertiser-text">Advertiser too</span>}
        </div>
        <p className="text-sm text-gray-700">{STATE_WORDS[row.card_state]}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Link href={biz} className={mainBtn}>Open business page</Link>
        <ActionMenu label="More" accessibleLabel={`More for ${row.name}`} entries={more} />
      </div>

      {/* The card */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {c ? (
          <Fact term={row.card_state === 'former' ? 'Last card' : 'Card'}>
            {c.contract_start ? `${dateGB(c.contract_start)} to ` : 'Until '}{dateGB(c.contract_end) || 'no end date'}
            {c.contract_amount ? `, ${moneyGB(c.contract_amount)}${c.billing_frequency === 'monthly' ? ' a month' : ''}` : ', no amount recorded'}
          </Fact>
        ) : (
          <Fact term="Card">No Club Card on file</Fact>
        )}
        {c && <Fact term="Invoice">{c.invoice_paid ? 'Paid' : 'Not marked paid'}</Fact>}
        {row.table?.in_renewal_window && <Fact term="Renewal">{RENEWAL_STAGE_LABEL[row.table.renewal_stage ?? ''] ?? row.table.renewal_stage ?? 'Not started'}</Fact>}
        {row.terms > 1 && <Fact term="Terms">{row.terms} Club Card terms on file</Fact>}
        {row.table?.attention && <Fact term="Needs attention">{row.table.attention.detail}</Fact>}
        <Fact term="Last in touch">{row.table?.last_in_touch ? dateGB(row.table.last_in_touch) : 'Never'}</Fact>
        {loaded?.latestEmail && (
          <Fact term="Latest email">
            {loaded.latestEmail.direction === 'received' ? 'From them' : 'From you'}, {formatDateGB(loaded.latestEmail.entry_date)}
            {loaded.latestEmail.subject ? `: ${loaded.latestEmail.subject}` : ''}
          </Fact>
        )}
      </dl>

      {unpaid.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-700">Unpaid invoices</p>
          <ul className="border-t border-ms-grid text-sm">
            {unpaid.map((v) => (
              <li key={v.qbo_invoice_id} className="border-b border-ms-grid py-1.5 flex flex-wrap gap-x-3">
                <span className="font-semibold text-brand-dark">{v.doc_number ? `No. ${v.doc_number}` : 'Invoice'}</span>
                <span>{moneyGB(v.balance)}</span>
                {v.due_date && <span className={v.due_date < today ? 'text-ms-red-text' : 'text-gray-600'}>due {dateGB(v.due_date)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main contact, always with role, email and phone (Hard Rule 4) */}
      <div className="text-sm space-y-0.5">
        <p className="text-xs font-semibold text-gray-700">Main contact</p>
        {detail === 'loading' ? (
          <p className="text-gray-600">Loading…</p>
        ) : detail === 'error' ? (
          <p className="text-ms-red-text">Could not load the contact. <Link href={biz} className="underline">Open the business</Link></p>
        ) : loaded?.contact ? (
          <>
            <p>
              <span className="font-semibold text-brand-dark">{loaded.contact.name}</span>
              {loaded.contact.role ? `, ${loaded.contact.role}` : <span className="text-gray-600">, no role recorded</span>}
            </p>
            <p>Email: {loaded.contact.emails.length > 0 ? loaded.contact.emails.map((e, n) => <span key={e}>{n > 0 && ', '}<a href={`mailto:${e}`} className="text-brand-navy hover:underline break-all">{e}</a></span>) : <span className="text-gray-600">none recorded</span>}</p>
            <p>Phone: {loaded.contact.phones.length > 0 ? loaded.contact.phones.map((p, n) => <span key={p}>{n > 0 && ', '}<a href={`tel:${p.replace(/\s/g, '')}`} className="text-brand-navy hover:underline">{p}</a></span>) : <span className="text-gray-600">none recorded</span>}</p>
          </>
        ) : (
          <p className="text-gray-600">No named contact yet. <Link href={biz} className="text-brand-navy hover:underline">Add one on the business page</Link></p>
        )}
      </div>

      {/* The website page */}
      <div className="text-sm space-y-1">
        <p className="text-xs font-semibold text-gray-700">Website page</p>
        {m?.page_link ? (
          <>
            <p>
              <a href={m.page_link} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline break-words">{m.page_title ?? 'Member page'}</a>
              <span className="text-xs text-gray-600"> · edited {m.wp_modified ? dateGB(m.wp_modified) : 'unknown'}{m.offer_confirmed_at ? ` · offer confirmed ${dateGB(m.offer_confirmed_at)}` : ''}</span>
            </p>
            {m.offer_text && <p className="text-gray-700 whitespace-pre-line">{m.offer_text}</p>}
            <p className="text-xs">
              <Check ok={(m.in_az_count ?? 0) === 1} label={(m.in_az_count ?? 0) > 1 ? `A-Z ×${m.in_az_count}` : 'A-Z'} />{' '}
              <Check ok={(m.map_count ?? 0) > 0} label="Map" />{' '}
              <Check ok={(m.categories ?? []).length > 0} label={(m.categories ?? []).join(', ') || 'Category'} />{' '}
              {m.in_latest_offers && <Check ok label="Latest Offers" />}
            </p>
            {(m.contact_mismatch ?? []).length > 0 && <p className="text-xs text-ms-red-text">Differs from the app: {(m.contact_mismatch ?? []).join(', ')}</p>}
          </>
        ) : (
          <p className="text-gray-600">{row.card_state === 'former' ? 'No live page.' : 'No page on the website.'}</p>
        )}
        {(m?.issues.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {m!.issues.map((i) => <span key={i} className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-sm', i === 'page_lapsed' ? 'bg-ms-red text-ms-red-text' : 'bg-ms-orange text-ms-orange-text')}>{issueText(row, i)}</span>)}
          </div>
        )}
        {m?.page_id && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={busy} className={softBtn} onClick={() => offer({ confirm: true }, 'Offer marked as still right')}>Offer still right</button>
            <button type="button" disabled={busy} className={softBtn} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
              {m.offer_ends ? `Offer ends ${dateGB(m.offer_ends)}: change` : 'Set offer end date'}
            </button>
          </div>
        )}
        {picking && m?.page_id && (
          <form
            className="flex flex-wrap gap-2 items-end bg-brand-warm border border-black/[0.06] rounded-sm p-2"
            onSubmit={(e) => { e.preventDefault(); if (endDate) offer({ offer_ends_set: endDate }, `Offer end date set to ${dateGB(endDate)}`) }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setPicking(false) } }}
          >
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Offer ends</span>
              <input type="date" autoFocus required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm border border-black/[0.12] rounded-sm px-2 min-h-10 md:min-h-8 bg-white" />
            </label>
            <button type="submit" disabled={busy || !endDate} className={mainBtn}>Save date</button>
            {m.offer_ends && <button type="button" disabled={busy} className={softBtn} onClick={() => offer({ offer_ends_set: null }, 'Offer end date cleared')}>Clear date</button>}
            <button type="button" onClick={() => setPicking(false)} className={softBtn}>Cancel</button>
          </form>
        )}
      </div>

      {/* Coverage: newsletter and news articles */}
      <div className="text-sm space-y-1">
        <p className="text-xs font-semibold text-gray-700">Coverage</p>
        <p>
          Last in the newsletter:{' '}
          {row.table?.newsletter ? (
            row.table.newsletter.url
              ? <a href={row.table.newsletter.url} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline">{dateGB(row.table.newsletter.date)}</a>
              : dateGB(row.table.newsletter.date)
          ) : 'never'}
          {due && <span className="ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-sm bg-ms-yellow text-ms-yellow-text">Due a mention</span>}
        </p>
        {articles === null ? (
          <p className="text-gray-600">Loading news articles…</p>
        ) : articles.length === 0 ? (
          <p className="text-gray-600">No news articles found.</p>
        ) : (
          <ul className="space-y-0.5">
            {articles.map((a) => (
              <li key={a.id}>
                <span className="text-gray-600 tabular-nums">{a.published_date ? dateGB(a.published_date) : 'Undated'}</span>{' '}
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline">{a.title}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? 'font-semibold text-brand-olive' : 'font-semibold text-ms-red-text'}>{ok ? '✓' : '✗'} {label}</span>
}

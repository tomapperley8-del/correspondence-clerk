'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cn, formatDateGB } from '@/lib/utils'
import type { AdvertisingRow, AdvertisingSummary } from '@/app/actions/advertising-tab'
import { ActionMenu } from '@/components/ui/action-menu'
import { FilterChips } from '@/components/ui/filter-chips'
import { FoldSection } from '@/components/ui/fold-section'
import { PipelineBoard } from '@/components/pipeline/PipelineBoards'
import { RENEWAL_STAGE_LABEL } from '@/app/businesses/_components/MastersheetTable'
import { downloadSheet } from '@/lib/spreadsheet-export'

// The Advertising tab (UI overhaul Stage 16d, layout B, Tom's pick on 28 Oct):
// a strip of renewals coming up by stage, then a card per advertiser, ending
// soonest first, with a table view and the advertisers' Renewals board (moved
// here from Businesses). Performance stats have no source yet, so each card
// says so; no numbers are made up. Nothing here writes, except the board's
// own stage moves.

type Show = 'advertisers' | 'former' | 'all'
type View = 'cards' | 'table' | 'board'

const SHOWS: { key: Show; label: string }[] = [
  { key: 'advertisers', label: 'Advertisers' },
  { key: 'former', label: 'Former advertisers' },
  { key: 'all', label: 'Everything' },
]

/** The renewal strip's columns: the Renewals board's stages, with agreed and paid together. */
const STRIP: { key: string; label: string; stages: (string | null)[] }[] = [
  { key: 'to_contact', label: 'To contact', stages: ['not_started', null] },
  { key: 'contacted', label: 'Contacted', stages: ['contacted'] },
  { key: 'in_discussion', label: 'In discussion', stages: ['in_discussion'] },
  { key: 'agreed', label: 'Agreed or paid', stages: ['agreed', 'invoice_paid'] },
]

const card = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'
const dateGB = (d: string | null | undefined) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')
const moneyGB = (n: number | null | undefined) => (n === null || n === undefined ? '' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`)

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function endPill(r: AdvertisingRow, today: string): { text: string; cls: string } {
  const end = r.contract.contract_end
  if (r.state === 'former') return { text: end ? `Ended ${dateGB(end)}` : 'Ended', cls: 'bg-ms-former text-ms-former-text' }
  if (!end) return { text: 'No end date', cls: 'bg-ms-muted text-ms-muted-text' }
  if (end < today) return { text: `Ended ${dateGB(end)}`, cls: 'bg-ms-red text-ms-red-text' }
  if (end <= addDaysISO(today, 45)) return { text: `Ends ${dateGB(end)}`, cls: 'bg-ms-orange text-ms-orange-text' }
  return { text: `Ends ${dateGB(end)}`, cls: 'bg-ms-muted text-ms-muted-text' }
}

/** How far through its term a deal is, 0 to 100; null without both dates. */
function progress(r: AdvertisingRow, today: string): number | null {
  const { contract_start: s, contract_end: e } = r.contract
  if (!s || !e || e <= s) return null
  const span = Date.parse(e) - Date.parse(s)
  return Math.max(0, Math.min(100, Math.round(((Date.parse(today) - Date.parse(s)) / span) * 100)))
}

function paidText(r: AdvertisingRow) {
  const { invoice_paid: paid, billing_frequency: freq } = r.contract
  if (paid) return 'paid'
  return freq === 'monthly' ? 'monthly, not all paid' : 'not paid yet'
}

function contactName(r: AdvertisingRow) {
  const c = r.table?.contact
  if (!c || c.is_placeholder) return ''
  return c.role ? `${c.name} (${c.role})` : c.name
}

function renewalLabel(r: AdvertisingRow) {
  const s = r.table?.renewal_stage
  return s ? RENEWAL_STAGE_LABEL[s] ?? s : 'To contact'
}

export function AdvertisingTab({ data, initialShow, initialView }: {
  data: { today: string; rows: AdvertisingRow[]; summary: AdvertisingSummary }
  initialShow?: string
  initialView?: string
}) {
  const { today, rows, summary } = data
  const [show, setShow] = useState<Show>(SHOWS.some((s) => s.key === initialShow) ? (initialShow as Show) : 'advertisers')
  const [view, setView] = useState<View>(initialView === 'table' || initialView === 'board' ? initialView : 'cards')

  useEffect(() => {
    const params = new URLSearchParams()
    if (show !== 'advertisers') params.set('show', show)
    if (view === 'board') params.set('board', '1')
    else if (view === 'table') params.set('view', 'table')
    const s = params.toString()
    window.history.replaceState(null, '', s ? `/advertising?${s}` : '/advertising')
  }, [show, view])

  const counts: Record<Show, number> = {
    advertisers: summary.inForce + summary.grace,
    former: summary.former,
    all: rows.length,
  }
  const shown = useMemo(
    () => rows.filter((r) => (show === 'all' ? true : show === 'former' ? r.state === 'former' : r.state !== 'former')),
    [rows, show],
  )
  const renewing = useMemo(() => rows.filter((r) => r.state !== 'former' && r.table?.in_renewal_window), [rows])
  const notRenewing = renewing.filter((r) => r.table?.renewal_stage === 'not_renewing')
  const allBusinessNames = useMemo(() => rows.map((r) => ({ id: r.business_id, name: r.name })), [rows])

  function download(format: 'csv' | 'xlsx') {
    downloadSheet(
      {
        name: 'Advertising',
        header: ['Business', 'State', 'Deal', 'Start', 'End', 'Amount', 'Billing', 'Invoice', 'Renewal stage', 'Main contact', 'Email', 'Last in touch', 'News articles', 'Last in newsletter', 'Money owed'],
        rows: shown.map((r) => [
          r.name,
          r.state === 'in_force' ? 'In force' : r.state === 'grace' ? 'Grace period' : 'Former',
          r.contract.deal_terms?.replace(/\s+/g, ' ').trim() ?? '',
          dateGB(r.contract.contract_start),
          dateGB(r.contract.contract_end),
          r.contract.contract_amount === null ? '' : String(r.contract.contract_amount),
          r.contract.billing_frequency ?? '',
          paidText(r),
          r.state === 'former' ? '' : renewalLabel(r),
          contactName(r),
          r.table?.contact?.email ?? '',
          dateGB(r.table?.last_in_touch),
          String(r.articles.n),
          dateGB(r.table?.newsletter?.date),
          r.table?.money ? String(r.table.money.open_balance) : '',
        ]),
      },
      `advertising-${show}-${today}`,
      format,
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-700 mb-4">
        <b>{summary.inForce}</b> advertisers now{summary.grace ? <>, <b>{summary.grace}</b> in the grace period</> : null}
        {' · '}renewals ending in {summary.thisMonthLabel} <b>{summary.endingThisMonth}</b>, {summary.nextMonthLabel} <b>{summary.endingNextMonth}</b>
        {' · '}<b>{moneyGB(summary.incomeThisYear)}</b> from deals started in {summary.year}
        {' · '}<b className={summary.owed > 0 ? 'text-ms-red-text' : undefined}>{moneyGB(summary.owed)}</b> owed
      </p>

      {/* Renewals coming up, by stage */}
      <FoldSection storageKey="advertising.renewals" big title="Renewals coming up" count={renewing.length} className="mb-2 shadow-[var(--shadow-sm)]" bodyClassName="p-2">
        <p className="text-xs text-gray-600 mb-2">
          Deals ending in the next 45 days or ended in the last 60. Move them along on the Renewals board.
          {notRenewing.length > 0 && ` Not renewing: ${notRenewing.map((r) => r.name).join(', ')}.`}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {STRIP.map((col) => {
            const items = renewing.filter((r) => col.stages.includes(r.table?.renewal_stage ?? null))
            return (
              <div key={col.key} className={cn(card, 'px-3 py-2')}>
                <p className="font-semibold text-brand-dark text-sm">
                  {col.label} <span className="text-xs text-gray-600 font-normal">{items.length}</span>
                </p>
                {items.length === 0 ? (
                  <p className="text-xs text-gray-600">None</p>
                ) : (
                  <ul className="text-sm">
                    {items.map((r) => (
                      <li key={r.business_id}>
                        <Link href={`/businesses/${r.business_id}`} className="text-brand-navy hover:underline">{r.name}</Link>
                        <span className="text-xs text-gray-600"> · {r.contract.contract_end && r.contract.contract_end < today ? 'ended' : 'ends'} {dateGB(r.contract.contract_end)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </FoldSection>

      {/* Advertisers */}
      <FoldSection storageKey="advertising.list" big title="Advertisers" count={shown.length} defaultOpen openOnMount={initialView === 'board'} scroll="" className="shadow-[var(--shadow-sm)]" bodyClassName="p-2">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <FilterChips label="Show" value={view === 'board' ? ('' as Show) : show} onChange={(s) => { setShow(s); if (view === 'board') setView('cards') }} chips={SHOWS.map((s) => ({ key: s.key, label: s.label, count: counts[s.key] }))} />
          <span className="flex-1" />
          <div className="inline-flex border border-black/10 rounded-sm overflow-hidden" role="group" aria-label="Show as">
            {([['cards', 'Cards'], ['table', 'Table'], ['board', 'Renewals board']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cn(
                  'px-3 min-h-10 md:min-h-8 text-sm transition-colors duration-200 ease-out whitespace-nowrap',
                  view === key ? 'bg-brand-navy text-white' : 'bg-white text-gray-800 hover:bg-brand-warm',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'table' && (
            <ActionMenu
              label="Download"
              accessibleLabel={`Download ${shown.length} advertisers in this list`}
              className="text-brand-navy"
              entries={[
                { label: 'Excel (.xlsx)', hint: 'Every advertiser in this list, all columns', onSelect: () => download('xlsx') },
                { label: 'CSV', hint: 'Opens in Excel, Numbers or Google Sheets', onSelect: () => download('csv') },
              ]}
            />
          )}
        </div>

        {view === 'board' ? (
          <>
            <p className="text-xs text-gray-600 mb-2">Advertisers in the renewal window. Club Card renewals have their own board on the Club Card tab.</p>
            <PipelineBoard kind="renewals" only="advertiser" allBusinessNames={allBusinessNames} />
          </>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-600 py-4">Nobody in this list.</p>
        ) : view === 'table' ? (
          <AdvertisersTable rows={shown} today={today} />
        ) : (
          <>
            <p className="text-xs text-gray-600 mb-2">
              Ending soonest first. The bar shows how far through its term each deal is. Performance stats (impressions, clicks, reports) are not connected yet, so none are shown.
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[max(16rem,calc(100vh-25rem))] overflow-y-auto overscroll-contain">
              {shown.map((r) => <AdvertiserCard key={r.business_id} row={r} today={today} />)}
            </ul>
          </>
        )}
      </FoldSection>
    </div>
  )
}

function AdvertiserCard({ row: r, today }: { row: AdvertisingRow; today: string }) {
  const pill = endPill(r, today)
  const pct = r.state === 'former' ? null : progress(r, today)
  const c = r.table?.contact
  const owed = r.table?.money?.open_balance ?? 0
  return (
    <li className={cn(card, 'px-3.5 py-3 flex flex-col gap-1.5 min-w-0')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/businesses/${r.business_id}`} className="font-semibold text-[15px] text-brand-dark hover:underline">{r.name}</Link>
        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', pill.cls)}>{pill.text}</span>
      </div>
      {r.contract.deal_terms && <p className="text-sm text-gray-800 line-clamp-2" title={r.contract.deal_terms}>{r.contract.deal_terms}</p>}
      <p className="text-sm">
        {[moneyGB(r.contract.contract_amount), r.contract.billing_frequency === 'monthly' ? 'billed monthly' : null].filter(Boolean).join(', ')}
        {r.contract.contract_amount !== null && ' · '}
        <span className={r.contract.invoice_paid ? undefined : 'text-ms-red-text font-semibold'}>{paidText(r)}</span>
        {owed > 0 && <span className="text-ms-red-text font-semibold"> · {moneyGB(owed)} owed</span>}
      </p>
      {pct !== null && (
        <span className="block h-1.5 rounded-sm bg-ms-muted overflow-hidden" role="img" aria-label={`${pct}% through the term, ${dateGB(r.contract.contract_start)} to ${dateGB(r.contract.contract_end)}`}>
          <span className="block h-full bg-ms-band" style={{ width: `${Math.max(2, pct)}%` }} />
        </span>
      )}
      <p className="text-xs text-gray-600">
        {[
          r.state === 'former' ? `${r.terms} ${r.terms === 1 ? 'deal' : 'deals'} in all` : `Renewal: ${renewalLabel(r)}`,
          r.table?.last_in_touch ? `in touch ${dateGB(r.table.last_in_touch)}` : 'not in touch yet',
          `${r.articles.n} news ${r.articles.n === 1 ? 'article' : 'articles'}${r.articles.latest ? `, latest ${dateGB(r.articles.latest)}` : ''}`,
          r.table?.newsletter?.date ? `newsletter ${dateGB(r.table.newsletter.date)}` : null,
        ].filter(Boolean).join(' · ')}
      </p>
      {c && !c.is_placeholder && (
        <p className="text-xs text-gray-700">
          {contactName(r)}
          {c.email && <> · <a href={`mailto:${c.email}`} className="text-brand-navy hover:underline break-all">{c.email}</a></>}
          {c.phone && <> · {c.phone}</>}
        </p>
      )}
      <p className="text-xs text-gray-600 border-t border-dashed border-black/20 pt-1.5 mt-auto">Performance: not connected yet</p>
    </li>
  )
}

function AdvertisersTable({ rows, today }: { rows: AdvertisingRow[]; today: string }) {
  return (
    <div className="overflow-auto border border-ms-grid rounded-sm bg-white max-h-[max(16rem,calc(100vh-25rem))]">
      <table className="w-full min-w-[900px] text-[13px] border-collapse">
        <caption className="sr-only">Advertisers, ending soonest first.</caption>
        <thead>
          <tr>
            {['Business', 'Deal', 'Ends', 'Amount', 'Invoice', 'Renewal stage', 'Main contact', 'Last in touch', 'News', 'Newsletter'].map((h, i) => (
              <th key={h} scope="col" className={cn('sticky top-0 bg-ms-header text-white text-left font-semibold px-2 py-1.5 whitespace-nowrap', i === 0 ? 'left-0 z-20' : 'z-10')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pill = endPill(r, today)
            return (
              <tr key={r.business_id} className="border-t border-ms-grid align-top hover:bg-brand-warm">
                <th scope="row" className="sticky left-0 z-[5] bg-white text-left font-semibold px-2 py-1.5 max-w-[220px]">
                  <Link href={`/businesses/${r.business_id}`} className="text-brand-dark hover:underline">{r.name}</Link>
                </th>
                <td className="px-2 py-1.5 max-w-[280px]"><span className="line-clamp-2" title={r.contract.deal_terms ?? undefined}>{r.contract.deal_terms}</span></td>
                <td className="px-2 py-1.5 whitespace-nowrap"><span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-full', pill.cls)}>{pill.text}</span></td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{moneyGB(r.contract.contract_amount)}</td>
                <td className={cn('px-2 py-1.5 whitespace-nowrap', r.contract.invoice_paid ? '' : 'text-ms-red-text font-semibold')}>{paidText(r)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.state === 'former' ? '' : renewalLabel(r)}</td>
                <td className="px-2 py-1.5">{contactName(r)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{dateGB(r.table?.last_in_touch)}</td>
                <td className="px-2 py-1.5 tabular-nums">{r.articles.n}</td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{dateGB(r.table?.newsletter?.date)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

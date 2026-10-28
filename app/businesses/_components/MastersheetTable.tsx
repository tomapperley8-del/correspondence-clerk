'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ActionMenu, type MenuEntry } from '@/components/ui/action-menu'
import type { TableRow } from '@/app/actions/business-table'
import type { AttentionReason } from '@/app/actions/attention'
import { formatDateGB } from '@/lib/utils'

// The Businesses table drawn like the CC Mastersheet (Tom, 22 Oct 2026): one
// dense line per business, a dark green header, the name on a green band that
// stays put while the rest scrolls, coloured pills and date cells. The sheet's
// columns come first, then what the app adds: main contact, last in touch and
// needs attention. Colours are the ms-* tokens in globals.css.
//
// Stage 13 makes it a working spreadsheet: the columns are a list that can be
// shown, hidden, reordered and resized (the choice is saved with a view), the
// fields Tom owns are edited in the cell (outreach status, action date, notes;
// never status, deal or last in touch, which are worked out), each row has a
// main action and a labelled More menu, rows are tinted by state, and the same
// list gives the text for the Excel and CSV download.

export type SortKey = 'name' | 'contact' | 'deal' | 'last' | 'attention' | 'action' | 'newsletter'

/** Days a deal counts as close to its end (the renewal window in the plan). */
const ENDING_SOON_DAYS = 45

const REASON_LABEL: Record<AttentionReason, string> = {
  money_owed: 'Money owed',
  renewal: 'Renewal',
  club_card_lapsed: 'Club Card page',
  waiting_on_you: 'Waiting on you',
  todo: 'To-do',
  club_card: 'Club Card page',
}

export const RENEWAL_STAGE_LABEL: Record<string, string> = {
  not_started: 'To contact',
  contacted: 'Contacted',
  in_discussion: 'In discussion',
  in_progress: 'In discussion',
  agreed: 'Agreed',
  invoice_paid: 'Invoice paid',
  not_renewing: 'Not renewing',
}

type Tone = 'clubcard' | 'both' | 'advertiser' | 'prospect' | 'former' | 'muted' | 'blue' | 'green' | 'orange' | 'red' | 'yellow'

const PILL: Record<Tone, string> = {
  clubcard: 'bg-ms-clubcard text-white',
  both: 'bg-white text-ms-both-text border border-ms-clubcard',
  advertiser: 'bg-ms-advertiser text-ms-advertiser-text',
  prospect: 'bg-ms-prospect text-ms-prospect-text',
  former: 'bg-ms-former text-ms-former-text',
  muted: 'bg-ms-muted text-ms-muted-text',
  blue: 'bg-ms-blue text-ms-blue-text',
  green: 'bg-ms-green text-ms-green-text',
  orange: 'bg-ms-orange text-ms-orange-text',
  red: 'bg-ms-red text-ms-red-text',
  yellow: 'bg-ms-yellow text-ms-yellow-text',
}

/** Whole-cell colour for date cells, as the sheet's conditional formatting does. */
const CELL: Partial<Record<Tone, string>> = {
  green: 'bg-ms-green text-ms-green-text',
  orange: 'bg-ms-orange text-ms-orange-text',
  red: 'bg-ms-red text-ms-red-text',
}

function dateGB(iso: string): string {
  return formatDateGB(`${iso.slice(0, 10)}T12:00:00Z`)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000)
}

function ago(date: string, today: string): string {
  const d = daysBetween(date, today)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d > 0) return `${d}d ago`
  return d === -1 ? 'tomorrow' : `in ${-d}d`
}

function dealName(value: string | null, labels: Map<string, string>): string {
  if (!value) return 'Deal'
  return labels.get(value) ?? (value === 'advertiser' ? 'Advertiser' : value === 'club_card' ? 'Club Card' : value)
}

/** The sheet's RELATIONSHIP TYPE, worked out from the deals in force and the status. */
function relationship(r: TableRow, labels: Map<string, string>): { label: string; tone: Tone } {
  const types = r.deal_types_in_force
  if (types.includes('club_card') && types.includes('advertiser')) return { label: 'Club Card + Advertiser', tone: 'both' }
  if (types.includes('club_card')) return { label: dealName('club_card', labels), tone: 'clubcard' }
  if (types.includes('advertiser')) return { label: dealName('advertiser', labels), tone: 'advertiser' }
  if (!r.is_commercial) return { label: r.business_type_label ?? 'Internal', tone: 'muted' }
  if (r.status === 'Unreviewed') return { label: 'Unreviewed', tone: 'muted' }
  if (r.status === 'Prospect') return { label: 'Prospect', tone: 'prospect' }
  const lastDeal = r.deal?.membership_type?.replace(/^former_/, '') ?? null
  // Ended within the grace period and not marked not renewing: still a member, shown with a red end date.
  if (r.is_active && (lastDeal === 'club_card' || lastDeal === 'advertiser')) {
    return { label: dealName(lastDeal, labels), tone: lastDeal === 'club_card' ? 'clubcard' : 'advertiser' }
  }
  if (r.status === 'Former' || (r.deal && !r.deal.in_force)) {
    return { label: lastDeal ? `Former ${dealName(lastDeal, labels)}` : 'Former', tone: 'former' }
  }
  return { label: r.status ?? '—', tone: 'muted' }
}

/** The sheet's OUTREACH STATUS: the disposition first, then who wrote last. */
function outreach(r: TableRow): { label: string; tone: Tone } {
  if (r.disposition === 'not_interested') return { label: 'Not Interested', tone: 'red' }
  if (r.disposition === 'follow_up_later') return { label: 'Follow Up Later', tone: 'yellow' }
  if (r.last_email_direction === 'received') return { label: 'In Conversation', tone: 'green' }
  if (r.last_email_direction === 'sent') return { label: 'Awaiting Reply', tone: 'blue' }
  return { label: 'Not Contacted', tone: 'muted' }
}

/** The sheet's ON WEBSITE? column, from the Club Card pages read nightly (Stage 6b). */
const ON_WEBSITE: Record<NonNullable<TableRow['on_website']>['state'], { label: string; tone: Tone; hint: string }> = {
  live: { label: 'Active', tone: 'green', hint: 'Club Card page on the website.' },
  lapsed: { label: 'Expired', tone: 'red', hint: 'Card ended but the page is still on the website.' },
  no_card: { label: 'No card', tone: 'orange', hint: 'Page on the website but no Club Card on file.' },
  missing: { label: 'No page', tone: 'red', hint: 'Club Card member with no page on the website.' },
}

/** Contract end colour and the sheet's REMINDER FLAG text. */
function dealState(r: TableRow, today: string): { tone: Tone; flag: string } | null {
  const end = r.deal?.contract_end
  if (!end) return null
  const days = daysBetween(today, end)
  if (days < 0 || !r.deal?.in_force) return { tone: 'red', flag: 'Expired' }
  if (days <= ENDING_SOON_DAYS) return { tone: 'orange', flag: days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} remaining` }
  return { tone: 'green', flag: 'Active' }
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-block max-w-full truncate rounded-full px-2 py-px text-[11px] font-semibold leading-4 ${PILL[tone]}`}>
      {children}
    </span>
  )
}

// One cell class for the grid: sheet-like borders, one line, no wrapping.
const TD = 'border-b border-r border-ms-grid px-2 py-1 whitespace-nowrap align-middle overflow-hidden text-ellipsis'

/** What the table can do to a row; BusinessTable supplies these. */
export type RowActions = {
  /** Saves a field Tom owns; resolves to an error message, or nothing when saved. */
  edit: (row: TableRow, patch: { disposition?: 'follow_up_later' | 'not_interested' | null; follow_up_after?: string | null; notes?: string | null }) => Promise<string | void>
  editNotes: (row: TableRow) => void
  addTodo: (row: TableRow) => void
  forNewsletter: (row: TableRow) => void
  offOutreach: (row: TableRow) => void
  notABusiness: (row: TableRow) => void
}

type Ctx = { today: string; labels: Map<string, string> }

export type ColumnKey =
  | 'actions' | 'relationship' | 'outreach' | 'action' | 'notes' | 'start' | 'end' | 'flag' | 'website'
  | 'email' | 'contact' | 'last' | 'attention' | 'newsletter' | 'type'

type ColumnDef = {
  key: ColumnKey
  label: string
  sortKey?: SortKey
  /** Starting width in pixels; Tom can drag it wider or narrower. */
  width: number
  /** The cell as plain text, for the download. */
  text: (r: TableRow, c: Ctx) => string
  /** Kept out of the download (buttons). */
  noExport?: boolean
}

function contactText(r: TableRow): string {
  if (!r.contact) return ''
  return [r.contact.is_placeholder ? null : r.contact.name, r.contact.role, r.contact.phone].filter(Boolean).join(' · ')
}

function lastWho(r: TableRow): string {
  return r.last_direction === 'received' ? 'From them' : r.last_direction === 'sent' ? 'From you' : (r.last_type ?? 'Entry')
}

export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'actions', label: 'Actions', width: 128, text: () => '', noExport: true },
  { key: 'relationship', label: 'Relationship type', width: 150, text: (r, c) => relationship(r, c.labels).label },
  { key: 'outreach', label: 'Outreach status', width: 175, text: (r) => outreach(r).label },
  { key: 'action', label: 'Action date', sortKey: 'action', width: 128, text: (r) => (r.follow_up_after ? dateGB(r.follow_up_after) : '') },
  { key: 'notes', label: 'Notes', width: 220, text: (r) => r.notes ?? '' },
  { key: 'start', label: 'Contract start', width: 96, text: (r) => (r.deal?.contract_start ? dateGB(r.deal.contract_start) : '') },
  { key: 'end', label: 'Contract end', sortKey: 'deal', width: 100, text: (r) => (r.deal?.contract_end ? dateGB(r.deal.contract_end) : '') },
  {
    key: 'flag',
    label: 'Reminder flag',
    width: 170,
    text: (r, c) =>
      [dealState(r, c.today)?.flag, r.in_renewal_window && r.renewal_stage ? RENEWAL_STAGE_LABEL[r.renewal_stage] ?? r.renewal_stage : null]
        .filter(Boolean)
        .join(' · '),
  },
  { key: 'website', label: 'On website?', width: 110, text: (r) => (r.on_website ? ON_WEBSITE[r.on_website.state].label : '') },
  { key: 'email', label: 'Email', width: 200, text: (r) => r.contact?.email ?? '' },
  { key: 'contact', label: 'Main contact', sortKey: 'contact', width: 210, text: contactText },
  {
    key: 'last',
    label: 'Last in touch',
    sortKey: 'last',
    width: 160,
    text: (r) => (r.last_in_touch ? `${dateGB(r.last_in_touch)} ${lastWho(r)}${r.last_subject ? `: ${r.last_subject}` : ''}` : ''),
  },
  {
    key: 'attention',
    label: 'Needs attention',
    sortKey: 'attention',
    width: 230,
    text: (r) => (r.attention ? `${REASON_LABEL[r.attention.reason]}${r.attention.is_snoozed ? ' (snoozed)' : ''}: ${r.attention.detail ?? ''}`.trim() : ''),
  },
  { key: 'newsletter', label: 'Last in newsletter', sortKey: 'newsletter', width: 130, text: (r) => (r.newsletter ? dateGB(r.newsletter.date) : '') },
  { key: 'type', label: 'Type', width: 140, text: (r) => r.business_type_label ?? '' },
]

/** The Mastersheet's order, then what the app adds. Newsletter and Type start hidden. */
export const DEFAULT_COLUMNS: ColumnKey[] = ['actions', 'relationship', 'outreach', 'action', 'notes', 'start', 'end', 'flag', 'website', 'email', 'contact', 'last', 'attention']

export const NAME_WIDTH = 230

export function columnDef(key: ColumnKey): ColumnDef | undefined {
  return COLUMN_DEFS.find((c) => c.key === key)
}

/** The rows as a sheet for the download: the business name, then the chosen columns in order. */
export function rowsAsSheet(rows: TableRow[], columns: ColumnKey[], today: string, labels: Map<string, string>) {
  const defs = columns.map(columnDef).filter((c): c is ColumnDef => !!c && !c.noExport)
  const ctx = { today, labels }
  return {
    header: ['Business', ...defs.map((d) => d.label)],
    rows: rows.map((r) => [r.name, ...defs.map((d) => d.text(r, ctx))]),
  }
}

/** Row tint by state (Mastersheet colours): needs attention red, unreviewed grey. Also said in words in the cells. */
function rowTint(r: TableRow): string | null {
  if (r.attention && !r.attention.is_snoozed) return r.attention.is_overdue ? 'bg-ms-red/35' : 'bg-ms-orange/25'
  if (r.status === 'Unreviewed') return 'bg-ms-muted/70'
  return null
}

export function MastersheetTable({
  rows,
  today,
  membershipLabels,
  sort,
  dir,
  onSort,
  emptyText,
  columns,
  widths,
  onWidth,
  actions,
  full = false,
}: {
  rows: TableRow[]
  today: string
  membershipLabels: Map<string, string>
  sort: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  emptyText: string
  columns: ColumnKey[]
  widths: Partial<Record<ColumnKey | 'name', number>>
  onWidth: (key: ColumnKey | 'name', width: number) => void
  actions: RowActions
  /** In full screen the table takes the window's height. */
  full?: boolean
}) {
  const defs = columns.map(columnDef).filter((c): c is ColumnDef => !!c)
  const widthOf = (key: ColumnKey | 'name', fallback: number) => widths[key] ?? fallback
  const total = widthOf('name', NAME_WIDTH) + defs.reduce((n, d) => n + widthOf(d.key, d.width), 0)

  return (
    // Scrolls both ways inside its own box, so the header row and the name column stay put like frozen panes.
    <div
      className={`${full ? 'max-h-[calc(100vh-12rem)]' : 'max-h-[75vh]'} overflow-auto border border-ms-grid bg-white`}
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <table className="table-fixed border-separate border-spacing-0 text-[13px] leading-5" style={{ width: total }}>
        <thead>
          <tr>
            <HeaderCell
              label="Business"
              sortKey="name"
              sort={sort}
              dir={dir}
              onSort={onSort}
              sticky
              width={Math.min(widthOf('name', NAME_WIDTH), 9999)}
              onWidth={(w) => onWidth('name', w)}
            />
            {defs.map((c) => (
              <HeaderCell
                key={c.key}
                label={c.label}
                sortKey={c.sortKey}
                sort={sort}
                dir={dir}
                onSort={onSort}
                width={widthOf(c.key, c.width)}
                onWidth={(w) => onWidth(c.key, w)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} row={r} today={today} membershipLabels={membershipLabels} defs={defs} actions={actions} nameWidth={widthOf('name', NAME_WIDTH)} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={defs.length + 1} className="px-3 py-8 text-center text-gray-500">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const MIN_WIDTH = 60
const MAX_WIDTH = 600

function HeaderCell({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  sticky = false,
  width,
  onWidth,
}: {
  label: string
  sortKey?: SortKey
  sort: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  sticky?: boolean
  width: number
  onWidth: (w: number) => void
}) {
  const active = !!sortKey && sort === sortKey
  const drag = useRef<{ x: number; w: number } | null>(null)
  const clamp = (w: number) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)))
  return (
    <th
      scope="col"
      style={{ width }}
      className={`sticky top-0 ${sticky ? 'left-0 z-30 max-w-[46vw]' : 'z-20'} bg-ms-header text-white text-left text-[11px] font-bold uppercase tracking-wide border-b border-r border-ms-band-hover px-2 py-2 whitespace-nowrap overflow-hidden`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : sortKey ? 'none' : undefined}
    >
      {sortKey ? (
        <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 uppercase hover:underline max-w-full truncate">
          {label}
          <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
        </button>
      ) : (
        <span className="block truncate">{label}</span>
      )}
      {/* Column width: drag the edge, or focus it and use the arrow keys. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label} column width`}
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuetext={`${width} pixels`}
        tabIndex={0}
        title="Drag to change the column width"
        className="absolute top-0 right-0 h-full w-2 cursor-col-resize touch-none hover:bg-white/30 focus:bg-white/40 focus:outline-none"
        onPointerDown={(e) => {
          e.preventDefault()
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, w: width }
        }}
        onPointerMove={(e) => {
          if (drag.current) onWidth(clamp(drag.current.w + e.clientX - drag.current.x))
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 64 : 16
          if (e.key === 'ArrowRight') onWidth(clamp(width + step))
          else if (e.key === 'ArrowLeft') onWidth(clamp(width - step))
          else return
          e.preventDefault()
        }}
      />
    </th>
  )
}

const OUTREACH_OPTIONS: { value: '' | 'follow_up_later' | 'not_interested'; tone?: Tone; label: string }[] = [
  { value: 'follow_up_later', tone: 'yellow', label: 'Follow Up Later' },
  { value: 'not_interested', tone: 'red', label: 'Not Interested' },
]

/** Outreach status as a Mastersheet-style drop-down. Blank = worked out from the emails. */
function OutreachCell({ row, actions }: { row: TableRow; actions: RowActions }) {
  const [busy, setBusy] = useState(false)
  const shown = outreach(row)
  const derived = outreach({ ...row, disposition: null })
  return (
    <select
      value={row.disposition ?? ''}
      disabled={busy}
      aria-label={`Outreach status for ${row.name}`}
      title="(auto) = worked out from the emails. Follow Up Later and Not Interested are set by you; a new email from them clears it."
      onChange={async (e) => {
        setBusy(true)
        await actions.edit(row, { disposition: (e.target.value || null) as 'follow_up_later' | 'not_interested' | null })
        setBusy(false)
      }}
      className={`max-w-full rounded-full pl-2 pr-1 py-px text-[11px] font-semibold leading-4 border-0 cursor-pointer focus:outline-2 focus:outline-brand-navy disabled:opacity-60 ${PILL[shown.tone]}`}
    >
      <option value="">{derived.label} (auto)</option>
      {OUTREACH_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/** Action date, edited in the cell: plain text until clicked, then a date field. Saved on leaving it or Enter. */
function ActionDateCell({ row, actions }: { row: TableRow; actions: RowActions }) {
  const saved = row.follow_up_after?.slice(0, 10) ?? ''
  const [editing, setEditing] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const commit = async (v: string) => {
    setEditing(false)
    if (v === saved || (v && !/^(19|20)\d\d-\d\d-\d\d$/.test(v))) return
    await actions.edit(row, { follow_up_after: v || null })
  }
  if (!editing) {
    return (
      <button
        ref={button}
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Action date for ${row.name}: ${saved ? dateGB(saved) : 'none'}. Change`}
        className="block w-full text-left min-h-6 focus:outline-2 focus:outline-brand-navy rounded-sm hover:underline"
      >
        {saved ? dateGB(saved) : <span className="text-gray-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">Set date</span>}
      </button>
    )
  }
  return (
    <input
      type="date"
      autoFocus
      defaultValue={saved}
      aria-label={`Action date for ${row.name}`}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit((e.target as HTMLInputElement).value)
          setTimeout(() => button.current?.focus())
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(false)
          setTimeout(() => button.current?.focus())
        }
      }}
      className="w-full bg-white text-[13px] leading-5 px-0 py-0 border-0 focus:outline-2 focus:outline-brand-navy rounded-sm"
    />
  )
}

function Row({
  row: r,
  today,
  membershipLabels,
  defs,
  actions,
  nameWidth,
}: {
  row: TableRow
  today: string
  membershipLabels: Map<string, string>
  defs: ColumnDef[]
  actions: RowActions
  nameWidth: number
}) {
  const tint = rowTint(r)
  const plain = tint ?? 'group-hover:bg-brand-paper'

  const cell = (d: ColumnDef) => {
    switch (d.key) {
      case 'actions': {
        const entries: MenuEntry[] = [
          { label: 'Add a to-do', hint: 'With a date; shows on Today and the calendar', onSelect: () => actions.addTodo(r) },
          { label: 'For the newsletter', hint: "Adds it to Wednesday's list", onSelect: () => actions.forNewsletter(r) },
          { label: 'Edit notes', onSelect: () => actions.editNotes(r) },
          ...(r.contact?.email ? [{ label: `Email ${r.contact.is_placeholder ? r.contact.email : r.contact.name}`, href: `mailto:${r.contact.email}`, external: true }] : []),
          { label: 'Open business', href: `/businesses/${r.id}` },
        ]
        const remove: MenuEntry[] = [
          ...(r.outreach_stage ? [{ label: 'Take off outreach', hint: 'You can undo it', onSelect: () => actions.offOutreach(r) }] : []),
          ...(r.status === 'Unreviewed' ? [{ label: 'Hide: not a business', hint: 'Its emails are kept; you can undo it', onSelect: () => actions.notABusiness(r) }] : []),
        ]
        if (remove.length) entries.push({ group: 'Remove', items: remove as { label: string; hint?: string; onSelect: () => void }[] })
        return (
          <td key={d.key} className={`${TD} ${plain} py-0 overflow-visible`}>
            <span className="flex items-center gap-0.5">
              <Link
                href={`/new-entry?businessId=${r.id}`}
                aria-label={`Log an email or call for ${r.name}`}
                className="inline-flex items-center text-xs font-semibold px-2 min-h-6 pointer-coarse:min-h-10 rounded-sm bg-brand-navy/[0.08] text-brand-navy hover:bg-brand-navy/[0.15] transition-colors duration-200 ease-out"
              >
                Log
              </Link>
              <ActionMenu entries={entries} accessibleLabel={`More actions for ${r.name}`} className="min-h-6 md:min-h-6 pointer-coarse:min-h-10" />
            </span>
          </td>
        )
      }
      case 'relationship': {
        const rel = relationship(r, membershipLabels)
        return <td key={d.key} className={`${TD} ${plain}`}><Pill tone={rel.tone}>{rel.label}</Pill></td>
      }
      case 'outreach':
        return <td key={d.key} className={`${TD} ${plain}`}><OutreachCell row={r} actions={actions} /></td>
      case 'action': {
        const overdue = !!r.follow_up_after && r.follow_up_after.slice(0, 10) < today
        const soon = !overdue && !!r.follow_up_after && daysBetween(today, r.follow_up_after) <= 7
        return (
          <td key={d.key} className={`${TD} py-0 ${overdue ? CELL.red : soon ? CELL.orange : plain}`} title={overdue ? 'Past the action date' : soon ? 'Within a week' : undefined}>
            <ActionDateCell row={r} actions={actions} />
          </td>
        )
      }
      case 'notes':
        return (
          <td key={d.key} className={`${TD} ${plain} py-0`}>
            <button
              type="button"
              onClick={() => actions.editNotes(r)}
              aria-label={r.notes ? `Edit notes for ${r.name}: ${r.notes}` : `Add notes for ${r.name}`}
              title={r.notes ?? 'Add notes'}
              className="block w-full text-left truncate min-h-6 hover:underline focus:outline-2 focus:outline-brand-navy rounded-sm"
            >
              {r.notes ? r.notes.replace(/\s+/g, ' ') : <span className="text-gray-400">Add notes</span>}
            </button>
          </td>
        )
      case 'start':
        return <td key={d.key} className={`${TD} ${plain}`}>{d.text(r, { today, labels: membershipLabels })}</td>
      case 'end': {
        const state = dealState(r, today)
        return (
          <td key={d.key} className={`${TD} ${state ? CELL[state.tone] : plain}`} title={r.deal ? dealName(r.deal.membership_type, membershipLabels) : undefined}>
            {r.deal?.contract_end ? dateGB(r.deal.contract_end) : ''}
          </td>
        )
      }
      case 'flag': {
        const state = dealState(r, today)
        return (
          <td key={d.key} className={`${TD} ${plain} ${state?.tone === 'red' ? 'text-ms-red-text font-semibold' : state?.tone === 'orange' ? 'text-ms-orange-text font-semibold' : 'text-ms-green-text'}`}>
            {state?.flag ?? ''}
            {r.in_renewal_window && r.renewal_stage && (
              <span className="font-normal text-gray-600"> · {RENEWAL_STAGE_LABEL[r.renewal_stage] ?? r.renewal_stage}</span>
            )}
          </td>
        )
      }
      case 'website':
        return (
          <td key={d.key} className={`${TD} ${plain}`}>
            {r.on_website && (() => {
              const w = ON_WEBSITE[r.on_website.state]
              const pill = <Pill tone={w.tone}>{w.label}</Pill>
              return r.on_website.link
                ? <a href={r.on_website.link} target="_blank" rel="noopener noreferrer" title={`${w.hint} Opens the page on the website.`}>{pill}</a>
                : <span title={w.hint}>{pill}</span>
            })()}
          </td>
        )
      case 'email':
        return (
          <td key={d.key} className={`${TD} ${plain}`}>
            {r.contact?.email && (
              <a href={`mailto:${r.contact.email}`} className="block truncate hover:underline" style={{ color: 'var(--link-blue)' }} title={r.contact.email}>
                {r.contact.email}
              </a>
            )}
          </td>
        )
      case 'contact': {
        const line = contactText(r)
        return (
          <td key={d.key} className={`${TD} ${plain}`}>
            {r.contact ? (
              <span className="block truncate" title={`${line}${r.contact.is_primary ? '' : r.contact.is_placeholder ? ' (no named person on file)' : ' (not chosen as main contact)'}`}>
                {line || <span className="text-gray-500">No named person</span>}
                {!r.contact.is_primary && line && <span className="text-gray-400"> *</span>}
              </span>
            ) : (
              <span className="text-gray-400">No contact</span>
            )}
          </td>
        )
      }
      case 'last': {
        const who = lastWho(r)
        return (
          <td key={d.key} className={`${TD} ${plain}`}>
            {r.last_in_touch ? (
              <span className="block truncate" title={`${dateGB(r.last_in_touch)} · ${who}${r.last_subject ? `: ${r.last_subject}` : ''}`}>
                {dateGB(r.last_in_touch)} <span className="text-gray-500">{who === 'From them' ? '←' : who === 'From you' ? '→' : ''} {who}</span>
              </span>
            ) : (
              <span className="text-gray-400">Nothing filed</span>
            )}
          </td>
        )
      }
      case 'attention':
        return (
          <td key={d.key} className={`${TD} ${plain}`}>
            {r.attention ? (
              <span
                className="flex items-center gap-1.5 min-w-0"
                title={[
                  r.attention.detail,
                  r.attention.is_snoozed && r.attention.attention_snoozed_until ? `Snoozed until ${dateGB(r.attention.attention_snoozed_until)}` : null,
                  r.attention.reasons.length > 1
                    ? `Also: ${r.attention.reasons.filter((x) => x !== r.attention!.reason).map((x) => REASON_LABEL[x]).join(', ')}`
                    : null,
                ]
                  .filter(Boolean)
                  .join('\n')}
              >
                <Pill tone={r.attention.is_snoozed ? 'muted' : r.attention.is_overdue ? 'red' : 'orange'}>
                  {REASON_LABEL[r.attention.reason]}
                </Pill>
                <span className="truncate text-gray-600">
                  {r.attention.is_snoozed ? 'snoozed' : r.attention.since ? ago(r.attention.since, today) : ''}
                  {r.attention.reasons.length > 1 ? ` +${r.attention.reasons.length - 1}` : ''}
                </span>
              </span>
            ) : null}
          </td>
        )
      case 'newsletter':
        return (
          <td key={d.key} className={`${TD} ${plain}`}>
            {r.newsletter ? (
              r.newsletter.url ? (
                <a href={r.newsletter.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--link-blue)' }} title="Opens that issue">
                  {dateGB(r.newsletter.date)}
                </a>
              ) : dateGB(r.newsletter.date)
            ) : <span className="text-gray-400">Not yet</span>}
          </td>
        )
      case 'type':
        return <td key={d.key} className={`${TD} ${plain}`}>{r.business_type_label ?? ''}</td>
    }
  }

  return (
    <tr className="group">
      <td className={`${TD} sticky left-0 z-10 bg-ms-band group-hover:bg-ms-band-hover max-w-[46vw] border-r-ms-band-hover`} style={{ width: nameWidth }}>
        <Link
          href={`/businesses/${r.id}`}
          className="block truncate font-bold uppercase text-white hover:underline"
          title={[r.name, r.status, r.business_type_label].filter(Boolean).join(' · ')}
        >
          {r.name}
        </Link>
      </td>
      {defs.map(cell)}
    </tr>
  )
}

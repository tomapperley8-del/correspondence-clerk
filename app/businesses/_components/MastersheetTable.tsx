'use client'

import Link from 'next/link'
import type { TableRow } from '@/app/actions/business-table'
import type { AttentionReason } from '@/app/actions/attention'
import { formatDateGB } from '@/lib/utils'

// The Businesses table drawn like the CC Mastersheet (Tom, 22 Oct 2026): one
// dense line per business, a dark green header, the name on a green band that
// stays put while the rest scrolls, coloured pills and date cells. The sheet's
// columns come first, then what the app adds: main contact, last in touch and
// needs attention. Colours are the ms-* tokens in globals.css.

export type SortKey = 'name' | 'contact' | 'deal' | 'last' | 'attention'

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

const RENEWAL_STAGE_LABEL: Record<string, string> = {
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
const TD = 'border-b border-r border-ms-grid px-2 py-1 whitespace-nowrap align-middle'

type Column = { key: string; label: string; sortKey?: SortKey; width: string }

const COLUMNS: Column[] = [
  { key: 'relationship', label: 'Relationship type', width: 'w-[150px]' },
  { key: 'outreach', label: 'Outreach status', width: 'w-[130px]' },
  { key: 'action', label: 'Action date', width: 'w-[92px]' },
  { key: 'start', label: 'Contract start', width: 'w-[92px]' },
  { key: 'end', label: 'Contract end', sortKey: 'deal', width: 'w-[96px]' },
  { key: 'flag', label: 'Reminder flag', width: 'w-[170px]' },
  // "On website?" goes here once Stage 6b supplies it (Active green / Expired red pill).
  { key: 'email', label: 'Email', width: 'w-[200px]' },
  { key: 'contact', label: 'Main contact', sortKey: 'contact', width: 'w-[210px]' },
  { key: 'last', label: 'Last in touch', sortKey: 'last', width: 'w-[150px]' },
  { key: 'attention', label: 'Needs attention', sortKey: 'attention', width: 'w-[230px]' },
]

export function MastersheetTable({
  rows,
  today,
  membershipLabels,
  sort,
  dir,
  onSort,
  emptyText,
}: {
  rows: TableRow[]
  today: string
  membershipLabels: Map<string, string>
  sort: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  emptyText: string
}) {
  return (
    // Scrolls both ways inside its own box, so the header row and the name column stay put like frozen panes.
    <div className="max-h-[75vh] overflow-auto border border-ms-grid bg-white" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-[13px] leading-5">
        <thead>
          <tr>
            <HeaderCell label="Business" sortKey="name" sort={sort} dir={dir} onSort={onSort} sticky className="w-[230px] min-w-[150px] max-w-[46vw]" />
            {COLUMNS.map((c) => (
              <HeaderCell key={c.key} label={c.label} sortKey={c.sortKey} sort={sort} dir={dir} onSort={onSort} className={c.width} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.id} row={r} today={today} membershipLabels={membershipLabels} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-gray-500">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function HeaderCell({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  sticky = false,
  className = '',
}: {
  label: string
  sortKey?: SortKey
  sort: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  sticky?: boolean
  className?: string
}) {
  const active = !!sortKey && sort === sortKey
  return (
    <th
      scope="col"
      className={`sticky top-0 ${sticky ? 'left-0 z-30' : 'z-20'} bg-ms-header text-white text-left text-[11px] font-bold uppercase tracking-wide border-b border-r border-ms-band-hover px-2 py-2 whitespace-nowrap ${className}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : sortKey ? 'none' : undefined}
    >
      {sortKey ? (
        <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 uppercase hover:underline">
          {label}
          <span className="text-[10px]">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
        </button>
      ) : (
        label
      )}
    </th>
  )
}

function Row({ row: r, today, membershipLabels }: { row: TableRow; today: string; membershipLabels: Map<string, string> }) {
  const rel = relationship(r, membershipLabels)
  const out = outreach(r)
  const state = dealState(r, today)
  const actionOverdue = !!r.follow_up_after && r.follow_up_after.slice(0, 10) < today
  const contactLine = r.contact
    ? [r.contact.is_placeholder ? null : r.contact.name, r.contact.role, r.contact.phone].filter(Boolean).join(' · ')
    : ''
  const lastWho = r.last_direction === 'received' ? 'From them' : r.last_direction === 'sent' ? 'From you' : (r.last_type ?? 'Entry')

  return (
    <tr className="group">
      <td className={`${TD} sticky left-0 z-10 bg-ms-band group-hover:bg-ms-band-hover max-w-[46vw] border-r-ms-band-hover`}>
        <Link
          href={`/businesses/${r.id}`}
          className="block truncate font-bold uppercase text-white hover:underline"
          title={[r.name, r.status, r.business_type_label].filter(Boolean).join(' · ')}
        >
          {r.name}
        </Link>
      </td>

      <td className={`${TD} group-hover:bg-brand-paper`}>
        <Pill tone={rel.tone}>{rel.label}</Pill>
      </td>

      <td className={`${TD} group-hover:bg-brand-paper`}>
        <Pill tone={out.tone}>{out.label}</Pill>
      </td>

      <td className={`${TD} ${actionOverdue ? CELL.red : 'group-hover:bg-brand-paper'}`}>
        {r.follow_up_after ? dateGB(r.follow_up_after) : ''}
      </td>

      <td className={`${TD} group-hover:bg-brand-paper`}>{r.deal?.contract_start ? dateGB(r.deal.contract_start) : ''}</td>

      <td className={`${TD} ${state ? CELL[state.tone] : 'group-hover:bg-brand-paper'}`} title={r.deal ? dealName(r.deal.membership_type, membershipLabels) : undefined}>
        {r.deal?.contract_end ? dateGB(r.deal.contract_end) : ''}
      </td>

      <td className={`${TD} group-hover:bg-brand-paper ${state?.tone === 'red' ? 'text-ms-red-text font-semibold' : state?.tone === 'orange' ? 'text-ms-orange-text font-semibold' : 'text-ms-green-text'}`}>
        {state?.flag ?? ''}
        {r.in_renewal_window && r.renewal_stage && (
          <span className="font-normal text-gray-600"> · {RENEWAL_STAGE_LABEL[r.renewal_stage] ?? r.renewal_stage}</span>
        )}
      </td>

      <td className={`${TD} group-hover:bg-brand-paper max-w-[200px]`}>
        {r.contact?.email && (
          <a href={`mailto:${r.contact.email}`} className="block truncate hover:underline" style={{ color: 'var(--link-blue)' }} title={r.contact.email}>
            {r.contact.email}
          </a>
        )}
      </td>

      <td className={`${TD} group-hover:bg-brand-paper max-w-[210px]`}>
        {r.contact ? (
          <span className="block truncate" title={`${contactLine}${r.contact.is_primary ? '' : r.contact.is_placeholder ? ' (no named person on file)' : ' (not chosen as main contact)'}`}>
            {contactLine || <span className="text-gray-500">No named person</span>}
            {!r.contact.is_primary && contactLine && <span className="text-gray-400"> *</span>}
          </span>
        ) : (
          <span className="text-gray-400">No contact</span>
        )}
      </td>

      <td className={`${TD} group-hover:bg-brand-paper max-w-[150px]`}>
        {r.last_in_touch ? (
          <span className="block truncate" title={`${dateGB(r.last_in_touch)} · ${lastWho}${r.last_subject ? `: ${r.last_subject}` : ''}`}>
            {dateGB(r.last_in_touch)} <span className="text-gray-500">{lastWho === 'From them' ? '←' : lastWho === 'From you' ? '→' : ''} {lastWho}</span>
          </span>
        ) : (
          <span className="text-gray-400">Nothing filed</span>
        )}
      </td>

      <td className={`${TD} group-hover:bg-brand-paper max-w-[230px]`}>
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
    </tr>
  )
}

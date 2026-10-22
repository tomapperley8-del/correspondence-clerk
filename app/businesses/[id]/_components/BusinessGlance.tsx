'use client'

import { useState } from 'react'
import Link from 'next/link'
import { type Business } from '@/app/actions/businesses'
import { type Contact } from '@/app/actions/contacts'
import { type Correspondence } from '@/app/actions/correspondence'
import { type MembershipType } from '@/app/actions/membership-types'
import type { BusinessGlance as GlanceData, GlanceContract } from '@/app/actions/business-glance'
import type { AttentionReason } from '@/app/actions/attention'
import { CopyButton } from '@/components/CopyButton'
import { formatDateGB } from '@/lib/utils'

// The top of the business page (UI overhaul Stage 6): the deal, the main
// contact, what needs attention and when they were last in touch, in one row.

const REASON_LABEL: Record<AttentionReason, string> = {
  money_owed: 'Money owed',
  renewal: 'Renewal',
  club_card_lapsed: 'Club Card page',
  waiting_on_you: 'Waiting on you',
  todo: 'To-do',
  club_card: 'Club Card page',
}

export function dateOnlyGB(isoDate: string): string {
  return formatDateGB(`${isoDate.slice(0, 10)}T12:00:00Z`)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86400000)
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "today", "3 days ago", "in 5 days" */
export function relativeDays(date: string, today: string): string {
  const d = daysBetween(date, today)
  if (d === 0) return 'today'
  if (d > 0) return `${plural(d, 'day')} ago`
  return `in ${plural(-d, 'day')}`
}

export function membershipLabel(value: string | null, membershipTypes: MembershipType[]): string {
  if (!value) return 'Deal'
  const mt = membershipTypes.find((t) => t.value === value)
  if (mt) return mt.label
  if (value === 'club_card') return 'Club Card'
  if (value === 'advertiser') return 'Advertising'
  return value
}

export function money(amount: number | null, currency: string | null = 'GBP'): string | null {
  if (amount === null || amount === undefined) return null
  const symbol = !currency || currency === 'GBP' ? '£' : `${currency} `
  return `${symbol}${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-black/[0.06] rounded-sm p-4 min-w-0" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">{title}</h2>
      <div className="text-sm text-gray-900 space-y-1">{children}</div>
    </div>
  )
}

/** Deal terms exactly as written, cut to a few lines until asked for. */
function DealTerms({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 160 || text.split('\n').length > 4
  return (
    <div>
      <p className={`text-gray-600 whitespace-pre-wrap ${long && !open ? 'line-clamp-4' : ''}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="text-xs text-brand-navy hover:underline">
          {open ? 'Show less' : 'Show full terms'}
        </button>
      )}
    </div>
  )
}

function DealLine({ c, membershipTypes, today }: { c: GlanceContract; membershipTypes: MembershipType[]; today: string }) {
  const amount = money(c.contract_amount, c.contract_currency)
  const ended = c.contract_end && c.contract_end < today
  return (
    <div className="space-y-0.5">
      <p className="font-semibold">
        {membershipLabel(c.membership_type, membershipTypes)}
        {amount && <span className="font-normal text-gray-700"> · {amount}{c.billing_frequency === 'monthly' ? ' a month' : ''}</span>}
      </p>
      {(c.contract_start || c.contract_end) && (
        <p className="text-gray-700">
          {c.contract_start && dateOnlyGB(c.contract_start)}
          {c.contract_start && c.contract_end && ' to '}
          {c.contract_end && dateOnlyGB(c.contract_end)}
          {c.contract_end && (
            <span className={ended ? 'text-red-700' : 'text-gray-500'}>
              {' '}({ended ? 'ended' : 'ends'} {relativeDays(c.contract_end, today)})
            </span>
          )}
        </p>
      )}
      {c.deal_terms && <DealTerms text={c.deal_terms} />}
      <p className="text-xs text-gray-500">{c.invoice_paid ? 'Invoice paid' : 'Invoice not marked paid'}</p>
    </div>
  )
}

function ContactDetails({ contact }: { contact: Contact }) {
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="font-semibold">
        {contact.name_is_placeholder ? (
          <span className="italic font-normal text-gray-500">No name yet (filed as &ldquo;{contact.name}&rdquo;)</span>
        ) : contact.name}
      </p>
      <p className="text-gray-600">{contact.role || 'Role not set'}</p>
      {contact.emails && contact.emails.length > 0 ? contact.emails.map((email) => (
        <p key={email} className="flex items-center min-w-0">
          <a href={`mailto:${email}`} className="text-brand-navy hover:underline truncate">{email}</a>
          <CopyButton text={email} />
        </p>
      )) : <p className="text-gray-500">No email</p>}
      {contact.phones && contact.phones.length > 0 ? contact.phones.map((phone) => (
        <p key={phone} className="flex items-center">
          <a href={`tel:${phone}`} className="text-brand-navy hover:underline">{phone}</a>
          <CopyButton text={phone} />
        </p>
      )) : <p className="text-gray-500">No phone</p>}
    </div>
  )
}

interface Props {
  business: Business
  contacts: Contact[]
  glance: GlanceData | null
  correspondence: Correspondence[]
  membershipTypes: MembershipType[]
  onShowContacts: () => void
  onShowDetails: () => void
}

export function BusinessGlance({ business, contacts, glance, correspondence, membershipTypes, onShowContacts, onShowDetails }: Props) {
  const today = glance?.today ?? new Date().toISOString().slice(0, 10)

  // Deal: current contracts first; otherwise the most recent one that ended.
  const contracts = glance?.contracts ?? []
  const current = contracts.filter((c) => c.is_current)
  const lastEnded = current.length === 0
    ? [...contracts].filter((c) => c.contract_end).sort((a, b) => (b.contract_end! > a.contract_end! ? 1 : -1))[0]
    : undefined

  // Main contact; if none is chosen, the person on the most recent email.
  const primary = contacts.find((c) => c.is_primary && c.is_active !== false)
  const latestEntries = [...correspondence].sort((a, b) =>
    new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime()
  )
  const lastInTouch = !primary
    ? latestEntries.map((e) => contacts.find((c) => c.id === e.contact_id)).find((c) => c && !c.name_is_placeholder)
    : undefined
  const latest = latestEntries[0]

  const attention = glance?.attention ?? null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      <Card title="Deal">
        {!glance ? (
          <p className="text-gray-500">Loading…</p>
        ) : current.length > 0 ? (
          current.map((c) => <DealLine key={c.id} c={c} membershipTypes={membershipTypes} today={today} />)
        ) : lastEnded ? (
          <>
            <p className="text-gray-700">No current deal.</p>
            <p className="text-gray-600">
              Last: {membershipLabel(lastEnded.membership_type, membershipTypes)} ended {dateOnlyGB(lastEnded.contract_end!)}
            </p>
          </>
        ) : (
          <p className="text-gray-700">No deal on file.</p>
        )}
        <button type="button" onClick={onShowDetails} className="text-xs text-brand-navy hover:underline pt-1">
          Deal history and details
        </button>
      </Card>

      <Card title="Main contact">
        {primary ? (
          <ContactDetails contact={primary} />
        ) : lastInTouch ? (
          <>
            <p className="text-xs text-gray-500">No main contact chosen. Last in touch:</p>
            <ContactDetails contact={lastInTouch} />
          </>
        ) : (
          <p className="text-gray-700">No main contact chosen.</p>
        )}
        <button type="button" onClick={onShowContacts} className="text-xs text-brand-navy hover:underline pt-1">
          {primary ? `All contacts (${contacts.length})` : 'Choose main contact'}
        </button>
      </Card>

      <Card title="Needs attention">
        {!glance ? (
          <p className="text-gray-500">Loading…</p>
        ) : attention ? (
          <>
            <p className="font-semibold">
              {REASON_LABEL[attention.reason]}
              {attention.is_snoozed && attention.attention_snoozed_until && (
                <span className="font-normal text-gray-500"> · snoozed until {dateOnlyGB(attention.attention_snoozed_until)}</span>
              )}
            </p>
            <p className="text-gray-700 break-words">
              {attention.detail}
              {attention.reason === 'renewal' && attention.since && (
                <span className={attention.is_overdue ? 'text-red-700' : 'text-gray-500'}> ({relativeDays(attention.since, today)})</span>
              )}
            </p>
            {attention.since && attention.reason !== 'renewal' && (
              <p className={attention.is_overdue ? 'text-red-700' : 'text-gray-600'}>
                {attention.reason === 'waiting_on_you' ? 'Received'
                  : attention.reason === 'club_card_lapsed' ? 'Card ended'
                  : attention.reason === 'club_card' ? 'Offer ends' : 'Due'}{' '}
                {dateOnlyGB(attention.since)} ({relativeDays(attention.since, today)})
              </p>
            )}
            {attention.reasons.length > 1 && (
              <p className="text-xs text-gray-500">
                Also: {attention.reasons.filter((r) => r !== attention.reason).map((r) => REASON_LABEL[r]).join(', ')}
              </p>
            )}
            <Link href="/attention" className="text-xs text-brand-navy hover:underline inline-block pt-1">
              Open Needs attention
            </Link>
          </>
        ) : (
          <p className="text-gray-700">Nothing needs attention.</p>
        )}
      </Card>

      <Card title="Last contacted">
        {business.last_contacted_at ? (
          <p className="font-semibold">
            {formatDateGB(business.last_contacted_at)}{' '}
            <span className="font-normal text-gray-500">({relativeDays(business.last_contacted_at.slice(0, 10), today)})</span>
          </p>
        ) : (
          <p className="text-gray-700">Not recorded.</p>
        )}
        {latest && (
          <div className="text-gray-700 min-w-0">
            <p className="text-xs text-gray-500">
              Latest entry: {latest.type === 'Note' ? 'Note' : latest.direction === 'sent' ? 'Sent' : latest.direction === 'received' ? 'Received' : (latest.type ?? 'Entry')}
              {latest.entry_date && ` ${formatDateGB(latest.entry_date)}`}
            </p>
            {latest.subject && <p className="truncate" title={latest.subject}>{latest.subject}</p>}
            {latest.contact && <p className="text-xs text-gray-500">{latest.contact.name}</p>}
          </div>
        )}
      </Card>
    </div>
  )
}

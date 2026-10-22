'use client'

import { useMemo, useState } from 'react'
import { type Correspondence } from '@/app/actions/correspondence'
import { type Contact } from '@/app/actions/contacts'
import { type ConversationThread } from '@/app/actions/threads'
import { type MembershipType } from '@/app/actions/membership-types'
import type { BusinessGlance, GlanceContract, GlanceInvoice, GlanceTask } from '@/app/actions/business-glance'
import { CorrespondenceEntry } from './CorrespondenceEntry'
import { type EditFields } from './CorrespondenceEditForm'
import { dateOnlyGB, membershipLabel, money, relativeDays } from './BusinessGlance'

// One merged timeline (UI overhaul Stage 6): correspondence, to-dos, deal
// starts and ends, and QuickBooks invoices, newest first. Correspondence uses
// the same entry card as the classic page, so every entry action still works.

type Kind = 'correspondence' | 'task' | 'deal' | 'invoice'

type Item =
  | { kind: 'correspondence'; key: string; at: number; entry: Correspondence; pairedInvoice: boolean }
  | { kind: 'task'; key: string; at: number; task: GlanceTask }
  | { kind: 'deal'; key: string; at: number; contract: GlanceContract; event: 'start' | 'end' }
  | { kind: 'invoice'; key: string; at: number; invoice: GlanceInvoice; note: Correspondence | null }

const FILTERS: { kind: Kind | 'all'; label: string }[] = [
  { kind: 'all', label: 'Everything' },
  { kind: 'correspondence', label: 'Correspondence' },
  { kind: 'task', label: 'To-dos' },
  { kind: 'deal', label: 'Deals' },
  { kind: 'invoice', label: 'Invoices' },
]

function noteInvoiceId(entry: Correspondence): string | null {
  const meta = entry.ai_metadata as { source?: string; qbo_invoice_id?: string } | null
  return meta?.source === 'qbo_invoice' && meta.qbo_invoice_id ? String(meta.qbo_invoice_id) : null
}

function entryMatches(e: Correspondence, q: string): boolean {
  const text = e.formatted_text_current || e.formatted_text_original || e.raw_text_original || ''
  return !!(e.subject?.toLowerCase().includes(q) || e.contact?.name.toLowerCase().includes(q) || text.toLowerCase().includes(q))
}

const dayAt = (isoDate: string) => Date.parse(`${isoDate.slice(0, 10)}T12:00:00Z`)

interface Props {
  correspondence: Correspondence[]
  glance: BusinessGlance | null
  membershipTypes: MembershipType[]
  loading: boolean
  remainingInDB: number
  isLoadingMore: boolean
  loadMore: () => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  filteredOut: string | null
  onClearFilters: () => void
  onTaskDone: (taskId: string) => Promise<void>
  busyTaskId: string | null
  // CorrespondenceEntry passthrough
  contacts: Contact[]
  threads: ConversationThread[]
  displayNames: Record<string, string>
  isExpandedEntry: (id: string) => boolean
  onToggleExpand: (id: string) => void
  formattingInProgress: string | null
  onFormat: (id: string) => void
  editingEntryId: string | null
  onStartEdit: (entry: Correspondence) => void
  onSaveEdit: (id: string, fields: EditFields) => Promise<void>
  onCancelEdit: () => void
  onDelete: (id: string, subject: string) => void
  onPin: (id: string, isPinned: boolean) => Promise<void>
  onAction: (id: string, action: string, dueAt?: string) => Promise<void>
  onShowPrevious: (id: string) => void
  onShowNext: (id: string) => void
  assigningThreadEntryId: string | null
  setAssigningThreadEntryId: (v: string | null) => void
  creatingThreadFor: string | null
  setCreatingThreadFor: (v: string | null) => void
  newThreadName: string
  setNewThreadName: (v: string) => void
  onAssignThread: (entryId: string, threadId: string | null) => Promise<void>
  onCreateThread: (entryId: string, name: string) => Promise<void>
  setActionError: (v: string | null) => void
  onCreateTodo?: (entry: Correspondence) => Promise<void>
}

function Row({ label, tone, date, children }: { label: string; tone: string; date: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start border border-black/[0.06] bg-brand-warm rounded-sm px-4 py-3">
      <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm ${tone}`}>{label}</span>
      <div className="flex-1 min-w-0 text-sm text-gray-900">{children}</div>
      <span className="shrink-0 text-xs text-gray-500">{date}</span>
    </div>
  )
}

export function BusinessTimeline(props: Props) {
  const {
    correspondence, glance, membershipTypes, loading, remainingInDB, isLoadingMore, loadMore,
    searchQuery, setSearchQuery, filteredOut, onClearFilters, onTaskDone, busyTaskId,
    isExpandedEntry, ...entryProps
  } = props
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set())
  const today = glance?.today ?? new Date().toISOString().slice(0, 10)

  const allItems = useMemo<Item[]>(() => {
    // QuickBooks invoices are also filed as Notes. Pair each such note with its
    // invoice, so the invoice shows once; the note opens beneath it.
    const invoiceIds = new Set((glance?.invoices ?? []).map((i) => i.qbo_invoice_id))
    const noteFor = new Map<string, Correspondence>()
    for (const entry of correspondence) {
      const id = noteInvoiceId(entry)
      if (id && invoiceIds.has(id) && !noteFor.has(id)) noteFor.set(id, entry)
    }
    const pairedIds = new Set([...noteFor.values()].map((e) => e.id))
    const items: Item[] = correspondence.map((entry) => ({
      kind: 'correspondence', key: `c-${entry.id}`, at: new Date(entry.entry_date || entry.created_at).getTime(), entry,
      pairedInvoice: pairedIds.has(entry.id),
    }))
    for (const task of glance?.tasks ?? []) {
      // A done to-do sits where it was done; an open one where it was written.
      const at = task.status === 'done' && task.completed_at ? new Date(task.completed_at).getTime() : new Date(task.created_at).getTime()
      items.push({ kind: 'task', key: `t-${task.id}`, at, task })
    }
    for (const contract of glance?.contracts ?? []) {
      if (contract.contract_start) items.push({ kind: 'deal', key: `ds-${contract.id}`, at: dayAt(contract.contract_start), contract, event: 'start' })
      // A future end date belongs in the header, not in the history.
      if (contract.contract_end && contract.contract_end <= today) items.push({ kind: 'deal', key: `de-${contract.id}`, at: dayAt(contract.contract_end), contract, event: 'end' })
    }
    for (const invoice of glance?.invoices ?? []) {
      if (invoice.txn_date) items.push({ kind: 'invoice', key: `i-${invoice.qbo_invoice_id}`, at: dayAt(invoice.txn_date), invoice, note: noteFor.get(invoice.qbo_invoice_id) ?? null })
    }
    return items.sort((a, b) => b.at - a.at)
  }, [correspondence, glance, today])

  const counts = useMemo(() => {
    const c: Record<Kind | 'all', number> = { all: allItems.length, correspondence: 0, task: 0, deal: 0, invoice: 0 }
    for (const i of allItems) c[i.kind]++
    return c
  }, [allItems])

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    // While older emails are still unloaded, hold back other items from before
    // the oldest loaded email so the history never skips a stretch.
    const oldestLoaded = remainingInDB > 0
      ? Math.min(...correspondence.filter((e) => !e.is_pinned).map((e) => new Date(e.entry_date || e.created_at).getTime()))
      : -Infinity
    return allItems.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false
      // A paired invoice note shows under its invoice, except in the Correspondence list.
      if (item.kind === 'correspondence' && item.pairedInvoice && filter !== 'correspondence') return false
      if (filter === 'all' && item.kind !== 'correspondence' && item.at < oldestLoaded) return false
      if (!q) return true
      switch (item.kind) {
        case 'correspondence':
          return entryMatches(item.entry, q)
        case 'task':
          return item.task.title.toLowerCase().includes(q) || (item.task.notes ?? '').toLowerCase().includes(q)
        case 'deal':
          return `${item.contract.deal_terms ?? ''} ${membershipLabel(item.contract.membership_type, membershipTypes)}`.toLowerCase().includes(q)
        case 'invoice':
          return `${item.invoice.doc_number ?? ''} ${item.invoice.line_description ?? ''}`.toLowerCase().includes(q) || (!!item.note && entryMatches(item.note, q))
      }
    })
  }, [allItems, filter, searchQuery, remainingInDB, correspondence, membershipTypes])

  const renderEntry = (entry: Correspondence, key: string) => (
    <CorrespondenceEntry
      key={key}
      entry={entry}
      isExpanded={isExpandedEntry(entry.id)}
      showPrevButton={false}
      showNextButton={false}
      searchQuery={searchQuery}
      {...entryProps}
      setActionError={(v: string) => entryProps.setActionError(v)}
    />
  )

  const toggleNote = (key: string) => setOpenNotes((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const renderItem = (item: Item) => {
    switch (item.kind) {
      case 'correspondence':
        return renderEntry(item.entry, item.key)
      case 'task': {
        const t = item.task
        const done = t.status === 'done'
        const overdue = !done && t.due_date && t.due_date < today
        return (
          <Row key={item.key} label={t.source === 'manual' ? 'To-do' : 'Task'} tone="bg-brand-olive/15 text-brand-dark" date={formatAt(item.at)}>
            <p className={done ? 'line-through text-gray-500' : 'font-medium'}>{t.title}</p>
            {t.notes && <p className="text-gray-600 whitespace-pre-wrap mt-0.5">{t.notes}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
              {done ? (
                <span className="text-gray-500">Done{t.completed_at ? ` ${dateOnlyGB(t.completed_at)}` : ''}</span>
              ) : (
                <>
                  <span className={overdue ? 'text-red-700' : 'text-gray-600'}>
                    {t.due_date ? `Due ${dateOnlyGB(t.due_date)} (${relativeDays(t.due_date, today)})` : 'No due date'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onTaskDone(t.id)}
                    disabled={busyTaskId === t.id}
                    className="px-2 py-0.5 border border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 rounded-sm disabled:opacity-50"
                  >
                    {busyTaskId === t.id ? 'Saving…' : 'Mark done'}
                  </button>
                </>
              )}
              {t.source !== 'manual' && <span className="text-gray-500">Added automatically</span>}
            </div>
          </Row>
        )
      }
      case 'deal': {
        const c = item.contract
        const label = membershipLabel(c.membership_type, membershipTypes)
        const amount = money(c.contract_amount, c.contract_currency)
        return (
          <Row key={item.key} label="Deal" tone="bg-brand-navy/10 text-brand-navy" date={formatAt(item.at)}>
            <p className="font-medium">
              {item.event === 'start' ? `${label} started` : `${label} ended`}
              {item.event === 'start' && amount && <span className="font-normal text-gray-700"> · {amount}{c.billing_frequency === 'monthly' ? ' a month' : ''}</span>}
            </p>
            {item.event === 'start' && c.contract_end && (
              <p className="text-xs text-gray-600">Runs to {dateOnlyGB(c.contract_end)}</p>
            )}
            {item.event === 'start' && c.deal_terms && <p className="text-gray-600 whitespace-pre-wrap mt-0.5">{c.deal_terms}</p>}
          </Row>
        )
      }
      case 'invoice': {
        const i = item.invoice
        const voided = i.private_memo === 'Voided'
        const outstanding = !voided && (i.balance ?? 0) > 0
        const pastDue = outstanding && i.due_date && i.due_date < today
        return (
          <Row key={item.key} label="Invoice" tone="bg-gray-100 text-gray-700" date={formatAt(item.at)}>
            <p className="font-medium">
              Invoice {i.doc_number ?? i.qbo_invoice_id}
              {money(i.total_amount) && <span className="font-normal text-gray-700"> · {money(i.total_amount)}</span>}
            </p>
            {i.line_description && <p className="text-gray-600 mt-0.5">{i.line_description}</p>}
            <p className={`text-xs mt-0.5 ${pastDue ? 'text-red-700' : 'text-gray-600'}`}>
              {voided
                ? 'Voided'
                : outstanding
                  ? `${money(i.balance)} outstanding${i.due_date ? `, due ${dateOnlyGB(i.due_date)}${pastDue ? ` (${relativeDays(i.due_date, today)})` : ''}` : ''}`
                  : 'Paid'}
            </p>
            {item.note && (
              <>
                <button
                  type="button"
                  onClick={() => toggleNote(item.key)}
                  aria-expanded={openNotes.has(item.key)}
                  className="text-xs text-brand-navy hover:underline mt-1"
                >
                  {openNotes.has(item.key) ? 'Hide the note filed for this invoice' : 'Show the note filed for this invoice'}
                </button>
                {openNotes.has(item.key) && <div className="mt-2">{renderEntry(item.note, `n-${item.note.id}`)}</div>}
              </>
            )}
          </Row>
        )
      }
    }
  }

  return (
    <div className="bg-white border border-black/[0.06] rounded-sm p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>History</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Show in history">
          {FILTERS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
              className={`text-xs px-2.5 py-1 border rounded-sm transition-colors ${
                filter === kind ? 'bg-brand-navy text-white border-brand-navy' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label} ({counts[kind]}{kind === 'correspondence' && remainingInDB > 0 ? '+' : ''})
            </button>
          ))}
        </div>
      </div>

      <input
        type="text"
        placeholder="Search this history..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search this history"
        className="w-full px-3 py-2 mb-4 text-sm border border-gray-300 rounded-sm focus:border-brand-navy focus:outline-none"
      />

      {filteredOut && (
        <p className="text-xs text-gray-600 mb-4">
          Showing only {filteredOut} (a filter set on the classic page).{' '}
          <button type="button" onClick={onClearFilters} className="text-brand-navy hover:underline">Show all correspondence</button>
        </p>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-sm" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-600 py-8 text-center">{searchQuery ? 'Nothing matches that search.' : 'Nothing here yet.'}</p>
      ) : (
        <div className="space-y-3">{visible.map(renderItem)}</div>
      )}

      {!loading && remainingInDB > 0 && (filter === 'all' || filter === 'correspondence') && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="px-4 py-2 text-sm border border-gray-300 bg-white text-gray-700 hover:border-brand-navy rounded-sm disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading…' : `Show older history (${remainingInDB} more ${remainingInDB === 1 ? 'entry' : 'entries'})`}
          </button>
        </div>
      )}
    </div>
  )
}

function formatAt(at: number): string {
  return dateOnlyGB(new Date(at).toISOString())
}

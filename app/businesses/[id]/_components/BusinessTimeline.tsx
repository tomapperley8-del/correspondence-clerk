'use client'

import { useMemo, useRef, useState } from 'react'
import { ForNewsletterButton } from '@/components/ForNewsletterButton'
import { ActionMenu, type MenuItem } from '@/components/ui/action-menu'
import { FilterChips, type Chip } from '@/components/ui/filter-chips'
import { FullScreenPanel } from '@/components/ui/full-screen-panel'
import { ResizableSplit } from '@/components/ui/resizable-split'
import { rowButtonClass, rowQuietButtonClass } from '@/components/ui/item-row'
import { cn } from '@/lib/utils'
import { type Correspondence } from '@/app/actions/correspondence'
import { type Contact } from '@/app/actions/contacts'
import { type ConversationThread } from '@/app/actions/threads'
import { type MembershipType } from '@/app/actions/membership-types'
import type { BusinessGlance, GlanceContract, GlanceInvoice, GlanceTask } from '@/app/actions/business-glance'
import { CorrespondenceEntry } from './CorrespondenceEntry'
import { type EditFields } from './CorrespondenceEditForm'
import { dateOnlyGB, membershipLabel, money, relativeDays } from './BusinessGlance'
import type { RoutineDraft } from '@/app/actions/leads'
import { DRAFT_KIND_LABEL, draftStatus } from './BusinessDrafts'

// One merged timeline (UI overhaul Stage 6): correspondence, to-dos, deal
// starts and ends, and QuickBooks invoices, newest first. Correspondence uses
// the same entry card as the classic page, so every entry action still works.
// Stage 7: drafts the routines wrote sit just above the email they answer.
// Stage 14b: one line per item (date, kind, who and subject, the likely action
// and More), with the chosen item in full in a reader beside the list; on a
// phone it opens under its row. Full screen and a remembered divider.

type Kind = 'correspondence' | 'task' | 'deal' | 'invoice' | 'draft'

type Item =
  | { kind: 'correspondence'; key: string; at: number; entry: Correspondence; pairedInvoice: boolean }
  | { kind: 'task'; key: string; at: number; task: GlanceTask }
  | { kind: 'deal'; key: string; at: number; contract: GlanceContract; event: 'start' | 'end' }
  | { kind: 'invoice'; key: string; at: number; invoice: GlanceInvoice; note: Correspondence | null }
  | { kind: 'draft'; key: string; at: number; draft: RoutineDraft; answers: Correspondence | null }

const FILTERS: { kind: Kind | 'all'; label: string }[] = [
  { kind: 'all', label: 'Everything' },
  { kind: 'correspondence', label: 'Correspondence' },
  { kind: 'task', label: 'To-dos' },
  { kind: 'deal', label: 'Deals' },
  { kind: 'invoice', label: 'Invoices' },
  { kind: 'draft', label: 'Drafts' },
]

const bareSubject = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/^((re|fw|fwd)\s*:\s*)+/g, '').trim()

const entryAt = (e: Correspondence) => new Date(e.entry_date || e.created_at).getTime()

/**
 * The email a routine's draft answers: a received email with the same subject
 * in the 60 days before it, else a received email from the 7 days before it.
 * Null when there is none (a renewal or check-in out of the blue).
 * `received` is newest first.
 */
function answeredEmail(draft: RoutineDraft, received: Correspondence[]): Correspondence | null {
  const at = Date.parse(draft.created_at)
  const before = received.filter((e) => entryAt(e) <= at && at - entryAt(e) <= 60 * 86_400_000)
  const subject = bareSubject(draft.subject)
  const same = subject ? before.find((e) => bareSubject(e.subject) === subject) : undefined
  if (same) return same
  const latest = before[0]
  return latest && at - entryAt(latest) <= 7 * 86_400_000 ? latest : null
}

function noteInvoiceId(entry: Correspondence): string | null {
  const meta = entry.ai_metadata as { source?: string; qbo_invoice_id?: string } | null
  return meta?.source === 'qbo_invoice' && meta.qbo_invoice_id ? String(meta.qbo_invoice_id) : null
}

function entryMatches(e: Correspondence, q: string): boolean {
  const text = e.formatted_text_current || e.formatted_text_original || e.raw_text_original || ''
  return !!(e.subject?.toLowerCase().includes(q) || e.contact?.name.toLowerCase().includes(q) || text.toLowerCase().includes(q))
}

const taskLabel = (t: GlanceTask) =>
  t.source !== 'manual' ? 'Task'
    : t.task_category?.name === 'For Newsletter' ? 'Newsletter'
    : ['Call', 'Meeting', 'Event', 'Deadline'].includes(t.task_category?.name ?? '') ? t.task_category!.name
    : 'To-do'

const dayAt = (isoDate: string) => Date.parse(`${isoDate.slice(0, 10)}T12:00:00Z`)

interface Props {
  correspondence: Correspondence[]
  glance: BusinessGlance | null
  drafts: RoutineDraft[]
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
  /** Shown under the reader (the page's other sections as dropdowns); left out in full screen. */
  aside?: React.ReactNode
  /** Extra buttons beside Full screen (+ Entry, + Task ...). */
  controls?: React.ReactNode
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
    correspondence, glance, drafts, membershipTypes, loading, remainingInDB, isLoadingMore, loadMore,
    searchQuery, setSearchQuery, filteredOut, onClearFilters, onTaskDone, busyTaskId,
    isExpandedEntry, aside, controls, ...entryProps
  } = props
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set())
  // The row shown in the reader, and (on a phone) the row opened under itself.
  const [selected, setSelected] = useState<string | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
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
    // Drafts (not the ones held back) go just above the email they answer.
    const received = correspondence.filter((e) => e.direction === 'received').sort((a, b) => entryAt(b) - entryAt(a))
    for (const draft of drafts) {
      if (draft.outcome !== 'drafted') continue
      const answers = answeredEmail(draft, received)
      const at = answers ? entryAt(answers) + 1 : Date.parse(draft.created_at)
      items.push({ kind: 'draft', key: `d-${draft.id}`, at, draft, answers })
    }
    return items.sort((a, b) => b.at - a.at)
  }, [correspondence, glance, drafts, today])

  const counts = useMemo(() => {
    const c: Record<Kind | 'all', number> = { all: allItems.length, correspondence: 0, task: 0, deal: 0, invoice: 0, draft: 0 }
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
      // Drafts also show among the correspondence they answer.
      if (filter !== 'all' && item.kind !== filter && !(filter === 'correspondence' && item.kind === 'draft')) return false
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
        case 'draft':
          return `${item.draft.subject ?? ''} ${item.draft.recipient ?? ''} ${item.draft.reason ?? ''}`.toLowerCase().includes(q)
        case 'invoice':
          return `${item.invoice.doc_number ?? ''} ${item.invoice.line_description ?? ''}`.toLowerCase().includes(q) || (!!item.note && entryMatches(item.note, q))
      }
    })
  }, [allItems, filter, searchQuery, remainingInDB, correspondence, membershipTypes])

  // In the reader an email shows in full.
  const renderEntry = (entry: Correspondence, key: string, full = false) => (
    <CorrespondenceEntry
      key={key}
      entry={entry}
      isExpanded={full || isExpandedEntry(entry.id)}
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

  /** One line in the list. */
  function rowFor(item: Item): RowView {
    const date = formatAt(item.at)
    switch (item.kind) {
      case 'correspondence': {
        const e = item.entry
        const call = e.type === 'Call'
        const kind = e.direction === 'received' ? (call ? 'Call from' : 'From')
          : e.direction === 'sent' ? (call ? 'Called' : 'To')
          : (e.type ?? 'Entry')
        const who = e.contact?.name ?? (e.type === 'Note' ? 'Note' : 'No contact')
        const text = e.formatted_text_current || e.formatted_text_original || e.raw_text_original
        return {
          date, kind,
          kindTone: e.direction === 'received' ? 'text-ms-blue-text' : e.direction === 'sent' ? 'text-ms-green-text' : 'text-gray-600',
          title: who,
          detail: e.subject || firstLine(text),
          status: e.action_needed !== 'none' ? e.action_needed.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : e.is_pinned ? 'Pinned' : undefined,
          strong: e.direction === 'received',
        }
      }
      case 'task': {
        const t = item.task
        const done = t.status === 'done'
        const overdue = !done && !!t.due_date && t.due_date < today
        return {
          date, kind: taskLabel(t), kindTone: 'text-brand-dark', title: t.title, strong: !done, struck: done,
          status: done ? 'Done' : t.due_date ? `Due ${relativeDays(t.due_date, today)}` : undefined,
          late: overdue,
        }
      }
      case 'deal': {
        const c = item.contract
        const amount = money(c.contract_amount, c.contract_currency)
        return {
          date, kind: 'Deal', kindTone: 'text-brand-navy',
          title: `${membershipLabel(c.membership_type, membershipTypes)} ${item.event === 'start' ? 'started' : 'ended'}`,
          detail: item.event === 'start' && amount ? `${amount}${c.billing_frequency === 'monthly' ? ' a month' : ''}` : undefined,
        }
      }
      case 'invoice': {
        const i = item.invoice
        const voided = i.private_memo === 'Voided'
        const outstanding = !voided && (i.balance ?? 0) > 0
        return {
          date, kind: 'Invoice', kindTone: 'text-gray-600',
          title: `Invoice ${i.doc_number ?? i.qbo_invoice_id}`,
          detail: [money(i.total_amount), i.line_description].filter(Boolean).join(' · ') || undefined,
          status: voided ? 'Voided' : outstanding ? `${money(i.balance)} owed` : 'Paid',
          late: outstanding && !!i.due_date && i.due_date < today,
        }
      }
      case 'draft': {
        const d = item.draft
        return {
          date, kind: 'Draft', kindTone: 'text-brand-olive',
          title: `${DRAFT_KIND_LABEL[d.kind] ?? d.kind} draft`,
          detail: d.subject ?? undefined,
          status: d.sent_at ? undefined : 'Waiting to send',
        }
      }
    }
  }

  const renderItem = (item: Item, full = false) => {
    switch (item.kind) {
      case 'correspondence':
        return renderEntry(item.entry, item.key, full)
      case 'task': {
        const t = item.task
        const done = t.status === 'done'
        const overdue = !done && t.due_date && t.due_date < today
        return (
          <Row key={item.key} label={taskLabel(t)} tone="bg-brand-olive/15 text-brand-dark" date={formatAt(item.at)}>
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
                  {t.source === 'manual' && t.task_category?.name !== 'For Newsletter' && (
                    <ForNewsletterButton
                      from="task"
                      id={t.id}
                      className="px-2 py-0.5 border border-brand-olive text-brand-dark hover:bg-brand-warm rounded-sm disabled:opacity-50"
                    />
                  )}
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
      case 'draft': {
        const d = item.draft
        const waiting = !d.sent_at
        const answers = item.answers
        return (
          <Row key={item.key} label="Draft" tone={waiting ? 'bg-brand-olive/20 text-brand-dark' : 'bg-gray-100 text-gray-700'} date={formatAt(Date.parse(d.created_at))}>
            <p className="font-medium">
              {DRAFT_KIND_LABEL[d.kind] ?? d.kind} draft by the routine{d.subject ? `: ${d.subject}` : ''}
            </p>
            {answers && (
              <p className="text-xs text-gray-600 mt-0.5">
                Answers the email below{answers.subject ? `, "${answers.subject}"` : ''}, received {dateOnlyGB(answers.entry_date || answers.created_at)}
              </p>
            )}
            <p className={`text-xs mt-0.5 ${waiting ? 'text-brand-dark font-semibold' : 'text-gray-600'}`}>
              {draftStatus(d)}{d.recipient ? ` · to ${d.recipient}` : ''}
            </p>
            {d.reason && <p className="text-xs text-gray-500 mt-0.5">{d.reason}</p>}
            {waiting && (
              <a
                href="https://outlook.office.com/mail/drafts"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-brand-navy hover:underline mt-1"
              >
                Open Outlook Drafts
              </a>
            )}
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

  const chips: Chip<Kind | 'all'>[] = FILTERS
    .map(({ kind, label }) => ({ key: kind, label: `${label}${kind === 'correspondence' && remainingInDB > 0 ? ' (more to load)' : ''}`, count: counts[kind] }))
    .filter((c) => c.key === 'all' || c.count > 0)

  const current = visible.find((i) => i.key === selected) ?? visible[0] ?? null

  // Up and Down move through the rows (one Tab stop for the list), as on Today.
  function onListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row]') ?? [])
    const at = buttons.findIndex((b) => b === document.activeElement)
    if (at < 0) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))
    buttons[next].focus()
    setSelected(buttons[next].dataset.row ?? null)
  }

  /** Choose a row: the reader shows it; on a phone it opens under the row. */
  function open(key: string, focusReader = false) {
    setSelected(key)
    if (!window.matchMedia('(min-width: 1024px)').matches) setOpened((o) => (focusReader ? key : o === key ? null : key))
    else if (focusReader) window.setTimeout(() => document.getElementById('history-reader')?.focus(), 50)
  }

  /** The likely action as a button, the rest in More. Everything else is in the reader. */
  function rowActions(item: Item) {
    if (item.kind === 'task' && item.task.status !== 'done') {
      return (
        <button type="button" className={rowButtonClass} disabled={busyTaskId === item.task.id} onClick={() => onTaskDone(item.task.id)}>
          {busyTaskId === item.task.id ? 'Saving…' : 'Mark done'}
        </button>
      )
    }
    if (item.kind === 'draft' && !item.draft.sent_at) {
      return <a href="https://outlook.office.com/mail/drafts" target="_blank" rel="noopener noreferrer" className={rowButtonClass}>Open drafts</a>
    }
    if (item.kind !== 'correspondence') return null
    const e = item.entry
    const followUp = () => {
      const d = new Date()
      d.setDate(d.getDate() + 7)
      entryProps.onAction(e.id, 'follow_up', d.toISOString().split('T')[0])
    }
    const flagged = e.action_needed !== 'none'
    const all: (MenuItem & { key: string })[] = [
      ...(flagged
        ? [{ key: 'done', label: 'Mark done', hint: `Clears "${e.action_needed.replace(/_/g, ' ')}"`, onSelect: () => entryProps.onAction(e.id, 'none') }]
        : [
            { key: 'follow', label: 'Follow-up', hint: 'Flag it for 7 days from now', onSelect: followUp },
            { key: 'waiting', label: 'Waiting on them', onSelect: () => entryProps.onAction(e.id, 'waiting_on_them') },
          ]),
      ...(entryProps.onCreateTodo ? [{ key: 'todo', label: 'Create to-do', onSelect: () => entryProps.onCreateTodo!(e) }] : []),
      { key: 'edit', label: 'Edit', onSelect: () => { open(item.key); entryProps.onStartEdit(e) } },
      { key: 'pin', label: e.is_pinned ? 'Unpin' : 'Pin to the top', onSelect: () => entryProps.onPin(e.id, e.is_pinned ?? false) },
      { key: 'delete', label: 'Delete', hint: 'You can undo it', onSelect: () => entryProps.onDelete(e.id, e.subject || '') },
    ]
    const mainKey = flagged ? 'done' : e.direction === 'received' ? 'follow' : e.direction === 'sent' ? 'waiting' : 'edit'
    const main = all.find((a) => a.key === mainKey)!
    return (
      <>
        <button type="button" className={rowButtonClass} onClick={main.onSelect}>{main.label}</button>
        <ActionMenu
          accessibleLabel={`More for ${e.subject || 'this entry'}`}
          entries={[
            ...all.filter((a) => a.key !== mainKey),
            { label: 'All actions', hint: 'Newsletter, thread, move, copy, link', onSelect: () => open(item.key, true) },
          ]}
        />
      </>
    )
  }

  const list = (full: boolean) => (
    <div className="bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)] min-w-0">
      <div className="p-3 space-y-2 border-b border-black/[0.06]">
        <FilterChips chips={chips} value={filter} onChange={(k) => { setFilter(k); setSelected(null) }} label="Show in history" />
        <input
          type="search"
          placeholder="Search this history"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search this history"
          className="w-full px-3 min-h-10 md:min-h-8 text-sm border border-gray-300 rounded-sm focus:border-brand-navy focus:outline-none"
        />
        {filteredOut && (
          <p className="text-xs text-gray-700">
            Showing only {filteredOut} (a filter set on the classic page).{' '}
            <button type="button" onClick={onClearFilters} className="text-brand-navy hover:underline">Show all correspondence</button>
          </p>
        )}
      </div>
      {/* Long histories scroll inside the list, so the page's other sections stay on the first screen (Decision 29 Oct). */}
      <div ref={listRef} onKeyDown={onListKey} className={cn('overflow-y-auto overscroll-contain', full ? 'max-h-[calc(100vh-12rem)]' : 'max-h-[60vh] lg:max-h-[max(16rem,calc(100vh-34rem))]')}>
        {loading ? (
          <div className="animate-pulse space-y-2 p-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-9 bg-gray-100 rounded-sm" />)}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-700 py-8 text-center">{searchQuery ? 'Nothing matches that search.' : 'Nothing here yet.'}</p>
        ) : (
          <ul aria-label="History">
            {visible.map((item) => {
              const r = rowFor(item)
              const on = item.key === current?.key
              return (
                <li key={item.key} className="border-b border-black/[0.05] last:border-b-0">
                  <div className={cn('flex items-center gap-1 pr-2 border-l-[3px] transition-colors duration-200 ease-out', on ? 'bg-brand-navy/[0.06] border-brand-navy' : 'border-transparent hover:bg-brand-warm')}>
                    <button
                      type="button"
                      data-row={item.key}
                      tabIndex={on ? 0 : -1}
                      aria-current={on ? 'true' : undefined}
                      aria-expanded={opened === item.key}
                      aria-label={[r.date, r.kind, r.title, r.detail, r.status].filter(Boolean).join('. ')}
                      onClick={() => open(item.key)}
                      className="min-w-0 flex-1 text-left grid grid-cols-[4.75rem_minmax(0,1fr)] sm:grid-cols-[5.25rem_4.75rem_minmax(0,1fr)] gap-x-2 items-baseline pl-2 py-2 min-h-10 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy"
                    >
                      <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap">{r.date}</span>
                      <span className={cn('hidden sm:block text-[11px] font-semibold uppercase tracking-wide truncate', r.kindTone)}>{r.kind}</span>
                      <span className="min-w-0 line-clamp-2 break-words sm:line-clamp-none sm:block sm:truncate" title={[r.title, r.detail, r.status].filter(Boolean).join(' · ')}>
                        <span className={cn('sm:hidden text-[11px] font-semibold uppercase tracking-wide mr-1.5', r.kindTone)}>{r.kind}</span>
                        <span className={cn(r.strong && 'font-semibold', r.struck ? 'line-through text-gray-600' : 'text-brand-dark')}>{r.title}</span>
                        {r.detail && <span className="text-gray-600"> · {r.detail}</span>}
                        {r.status && (
                          <span className={cn('ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap', r.late ? 'bg-ms-red text-ms-red-text' : 'bg-brand-warm text-gray-700')}>
                            {r.status}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">{rowActions(item)}</div>
                  </div>
                  {opened === item.key && <div className="lg:hidden px-2 pb-3 pt-1 bg-brand-warm">{renderItem(item, true)}</div>}
                </li>
              )
            })}
          </ul>
        )}
        {!loading && remainingInDB > 0 && (filter === 'all' || filter === 'correspondence') && (
          <div className="p-3 text-center border-t border-black/[0.05]">
            <button type="button" onClick={loadMore} disabled={isLoadingMore} className={rowQuietButtonClass}>
              {isLoadingMore ? 'Loading…' : `Show older history (${remainingInDB} more ${remainingInDB === 1 ? 'entry' : 'entries'})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  const reader = (full: boolean) => (
    // The dropdowns sit above the reader and a long entry scrolls inside it, so
    // every section stays on the first screen (Decision 29 Oct). On a phone the
    // reader is hidden (entries open under their rows) and the dropdowns follow the list.
    <div className="space-y-3 min-w-0">
      {!full && aside}
      <section
        id="history-reader"
        tabIndex={-1}
        aria-label="The chosen entry"
        className={cn(
          'hidden lg:block bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)] p-3 overflow-y-auto overscroll-contain focus:outline-none',
          full ? 'max-h-[calc(100vh-8rem)]' : 'max-h-[max(16rem,calc(100vh-39rem))]',
        )}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.defaultPrevented && (e.target as HTMLElement).closest('[role="menu"]') === null) {
            listRef.current?.querySelector<HTMLElement>('button[data-row][tabindex="0"]')?.focus()
          }
        }}
      >
        {current ? renderItem(current, true) : <p className="text-sm text-gray-700">Choose a row to read it here.</p>}
      </section>
    </div>
  )

  return (
    <FullScreenPanel title="History" headingId="history-h" card={false} controls={controls}>
      {(full) => (
        <ResizableSplit storageKey="cc.business.split" defaultPercent={56} label="Resize the history and the reader" first={list(full)} second={reader(full)} />
      )}
    </FullScreenPanel>
  )
}

type RowView = { date: string; kind: string; kindTone: string; title: string; detail?: string; status?: string; late?: boolean; strong?: boolean; struck?: boolean }

const firstLine = (text: string | null | undefined) => (text ?? '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 140) ?? ''

function formatAt(at: number): string {
  return dateOnlyGB(new Date(at).toISOString())
}

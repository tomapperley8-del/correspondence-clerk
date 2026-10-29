'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import InboxCard from './InboxCard'
import { bulkDiscardInboundEmails, discardInboundEmail, fileInboundEmail, findEmailMatch } from '@/app/actions/inbound-email'
import { toast } from '@/lib/toast'
import { FullScreenPanel } from '@/components/ui/full-screen-panel'
import { ResizableSplit } from '@/components/ui/resizable-split'
import { ActionMenu } from '@/components/ui/action-menu'
import { rowQuietButtonClass } from '@/components/ui/item-row'
import { cn } from '@/lib/utils'
import type { InboundQueueItem } from '@/app/actions/inbound-email'
import type { Business } from '@/app/actions/businesses'

// Inbox triage (UI overhaul Stage 14b): one line per email on the left, the
// chosen email with its filing form on the right (on a phone it opens under
// its row). Full screen and a remembered divider, as on Today and the business
// page. Filing, discarding and blocking are the same InboxCard actions as before.

interface Props {
  items: InboundQueueItem[]
  businesses: Business[]
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function InboxListClient({ items, businesses }: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [discarding, setDiscarding] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [matches, setMatches] = useState<Map<string, string>>(new Map())
  const listRef = useRef<HTMLUListElement>(null)

  // As before, every waiting email is looked up when the page opens: a definite
  // contact match is filed at once, a business-only match is pre-selected.
  useEffect(() => {
    let filedAny = false
    Promise.all(items.map(async (item) => {
      const email = item.direction === 'sent' ? (item.to_emails?.[0]?.email ?? '') : item.from_email
      if (!email) return
      const match = await findEmailMatch(email)
      if (!match) return
      if (match.contactId && !match.routeToInbox) {
        const result = await fileInboundEmail(item.id, match.businessId, match.contactId)
        if (!result.error) {
          toast.success(`Auto-filed to ${match.businessName}`)
          filedAny = true
          setGone((prev) => new Set(prev).add(item.id))
          return
        }
      }
      setMatches((prev) => new Map(prev).set(item.id, match.businessId))
    })).then(() => { if (filedAny) router.refresh() })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = items.filter((i) => !gone.has(i.id))
  const chosen = shown.find((i) => i.id === current) ?? shown[0] ?? null
  const allSelected = shown.length > 0 && shown.every(i => selectedIds.has(i.id))
  const someSelected = selectedIds.size > 0
  const nameOf = (id: string | undefined) => (id ? businesses.find((b) => b.id === id)?.name : undefined)

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(shown.map(i => i.id)))
  }

  async function handleBulkDiscard() {
    const ids = Array.from(selectedIds)
    setDiscarding(true)
    const result = await bulkDiscardInboundEmails(ids)
    setDiscarding(false)
    if (result.error) {
      toast.error(`Failed to discard: ${result.error}`)
    } else {
      toast.success(`${ids.length} ${ids.length === 1 ? 'email' : 'emails'} discarded`)
      setSelectedIds(new Set())
      router.refresh()
    }
  }

  async function discardOne(id: string) {
    const result = await discardInboundEmail(id)
    if (result.error) {
      toast.error(`Failed to discard: ${result.error}`)
      return
    }
    toast.success('Email discarded')
    setGone((prev) => new Set(prev).add(id))
    router.refresh()
  }

  function choose(id: string, focusCard = false) {
    setCurrent(id)
    if (!window.matchMedia('(min-width: 1024px)').matches) setOpened((o) => (focusCard ? id : o === id ? null : id))
    else if (focusCard) window.setTimeout(() => document.getElementById('inbox-reader')?.focus(), 50)
  }

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row]') ?? [])
    const at = buttons.findIndex((b) => b === document.activeElement)
    if (at < 0) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))
    buttons[next].focus()
    setCurrent(buttons[next].dataset.row ?? null)
  }

  const card = (item: InboundQueueItem) => (
    <InboxCard key={item.id} item={item} businesses={businesses} skipAutoMatch matchedBusinessId={matches.get(item.id) ?? null} />
  )

  // A long queue scrolls inside the list, so Auto-filed, Discarded and Failed stay on the first screen (Decision 29 Oct).
  const list = () => (
    <div className="bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)] min-w-0">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-black/[0.06] min-h-12">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 min-h-10">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            aria-label="Select all emails"
            className="cursor-pointer size-4 accent-brand-navy"
          />
          {someSelected ? `${selectedIds.size} selected` : 'Select all'}
        </label>
        {someSelected && (
          <button type="button" onClick={handleBulkDiscard} disabled={discarding} className={cn(rowQuietButtonClass, 'border border-black/[0.15]')}>
            {discarding ? 'Discarding…' : `Discard ${selectedIds.size}`}
          </button>
        )}
      </div>
      <ul ref={listRef} onKeyDown={onListKey} aria-label="Emails to file" className="overflow-y-auto overscroll-contain max-h-[60vh] lg:max-h-[max(14rem,calc(100vh-24rem))]">
        {shown.map((item) => {
          const on = item.id === chosen?.id
          const who = item.direction === 'sent'
            ? `To ${item.to_emails?.[0]?.name || item.to_emails?.[0]?.email || 'unknown'}`
            : (item.from_name && item.from_name !== item.from_email ? item.from_name : item.from_email)
          const match = nameOf(matches.get(item.id))
          return (
            <li key={item.id} className="border-b border-black/[0.05] last:border-b-0">
              <div className={cn('flex items-center gap-1 pr-2 border-l-[3px] transition-colors duration-200 ease-out', on ? 'bg-brand-navy/[0.06] border-brand-navy' : 'border-transparent hover:bg-brand-warm')}>
                <label className="flex items-center justify-center size-10 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    aria-label={`Select ${item.subject ?? 'email'} from ${who}`}
                    className="cursor-pointer size-4 accent-brand-navy"
                  />
                </label>
                <button
                  type="button"
                  data-row={item.id}
                  tabIndex={on ? 0 : -1}
                  aria-current={on ? 'true' : undefined}
                  aria-expanded={opened === item.id}
                  onClick={() => choose(item.id)}
                  className="min-w-0 flex-1 text-left py-2 min-h-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-navy"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-dark" title={who}>{who}</span>
                    <span className="shrink-0 text-xs text-gray-600 tabular-nums">{shortDate(item.received_at)}</span>
                  </span>
                  <span className="block truncate text-sm text-brand-dark" title={item.subject ?? ''}>{item.subject ?? '(No subject)'}</span>
                  {match && <span className="block truncate text-xs text-ms-green-text">Matches {match}</span>}
                </button>
                <ActionMenu
                  accessibleLabel={`More for ${item.subject ?? 'this email'}`}
                  entries={[
                    { label: 'File it', hint: 'Choose the business and contact', onSelect: () => choose(item.id, true) },
                    { label: 'Discard', onSelect: () => discardOne(item.id) },
                  ]}
                />
              </div>
              {opened === item.id && <div className="lg:hidden px-2 pb-3 pt-1 bg-brand-warm">{card(item)}</div>}
            </li>
          )
        })}
      </ul>
    </div>
  )

  const reader = () => (
    <section
      id="inbox-reader"
      tabIndex={-1}
      aria-label="The chosen email"
      className="hidden lg:block lg:sticky lg:top-2 max-h-[calc(100vh-1rem)] overflow-y-auto focus:outline-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented && (e.target as HTMLElement).closest('[role="menu"], [role="dialog"]') === null) {
          listRef.current?.querySelector<HTMLElement>('button[data-row][tabindex="0"]')?.focus()
        }
      }}
    >
      {chosen ? card(chosen) : <p className="text-sm text-gray-700">Choose an email to file it.</p>}
    </section>
  )

  return (
    <FullScreenPanel title={`To file (${shown.length})`} headingId="inbox-h" card={false}>
      {() => (
        <ResizableSplit storageKey="cc.inbox.split" defaultPercent={45} min={30} label="Resize the email list and the filing pane" first={list()} second={reader()} />
      )}
    </FullScreenPanel>
  )
}

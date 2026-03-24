'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  getNeedsReply,
  getGoneQuiet,
  getOutstandingActions,
  getPureReminders,
  markCorrespondenceDone,
  snoozeCorrespondence,
  createCorrespondence,
} from '@/app/actions/correspondence'
import { formatDateGB, formatDateTimeGB } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type CorrespondenceItem = {
  kind: 'correspondence'
  id: string
  business_id: string
  business_name: string
  contact_id: string | null
  contact_name: string | null
  contact_role: string | null
  subject: string | null
  action_needed: string
  due_at: string | null
  entry_date: string | null
  direction: string | null
  daysAgo?: number
}

type BusinessItem = {
  kind: 'business'
  id: string
  business_id: string
  business_name: string
  last_contacted_at: string
  entry_count: number
}

type Item = CorrespondenceItem | BusinessItem

type SectionKey = 'needs_reply' | 'gone_quiet' | 'flagged' | 'reminders'

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  follow_up: 'Follow-up',
  waiting_on_them: 'Waiting on them',
  invoice: 'Invoice',
  renewal: 'Renewal',
  prospect: 'Prospect',
}

const ACTION_COLOURS: Record<string, string> = {
  follow_up: 'bg-blue-50 border-blue-300 text-blue-800',
  waiting_on_them: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  invoice: 'bg-orange-50 border-orange-400 text-orange-800',
  renewal: 'bg-purple-50 border-purple-400 text-purple-800',
  prospect: 'bg-green-50 border-green-400 text-green-800',
}

function daysAgo(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function isOverdue(dueAt: string): boolean {
  return new Date(dueAt) < new Date()
}

// ─── Section component ────────────────────────────────────────────────────────

type SectionProps = {
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ title, count, collapsed, onToggle, children }: SectionProps) {
  return (
    <div className="border-2 border-gray-200 bg-white mb-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900" style={{ fontFamily: 'Lora, serif' }}>
          {title}
          <span className="ml-2 text-sm font-normal text-gray-500">({count})</span>
        </span>
        <span className="text-gray-400 text-sm">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && <div className="divide-y divide-gray-100">{children}</div>}
    </div>
  )
}

// ─── Snooze dropdown ─────────────────────────────────────────────────────────

type SnoozeProps = {
  open: boolean
  onToggle: () => void
  onSnooze: (days: number) => void
  disabled: boolean
}

function SnoozeDropdown({ open, onToggle, onSnooze, disabled }: SnoozeProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onToggle])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        disabled={disabled}
        className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        Snooze ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 shadow-md z-10">
          {[
            { label: '3 days', days: 3 },
            { label: '1 week', days: 7 },
            { label: '1 month', days: 30 },
          ].map(({ label, days }) => (
            <button
              key={days}
              onClick={() => onSnooze(days)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Inline Reply panel ───────────────────────────────────────────────────────

type ReplyPanelProps = {
  businessId: string
  contactId: string | null
  onSave: () => void
  onCancel: () => void
}

function ReplyPanel({ businessId, contactId, onSave, onCancel }: ReplyPanelProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    const result = await createCorrespondence({
      business_id: businessId,
      contact_id: contactId || undefined,
      raw_text_original: text.trim(),
      direction: 'sent',
      type: 'Note',
      entry_date: new Date().toISOString(),
    })
    if ('error' in result && result.error) {
      setError(result.error)
      setSaving(false)
    } else {
      onSave()
    }
  }

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type your reply or note…"
        rows={3}
        className="w-full text-sm border border-gray-300 px-3 py-2 resize-none focus:outline-none focus:border-[#2C4A6E]"
      />
      {error && <p className="text-red-700 text-xs mt-1">{error}</p>}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleSave}
          disabled={saving || !text.trim()}
          className="px-3 py-1 text-xs font-semibold bg-[#2C4A6E] text-white hover:bg-[#243d5c] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save reply'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Item row ─────────────────────────────────────────────────────────────────

type ItemRowProps = {
  item: Item
  focused: boolean
  replyOpen: boolean
  snoozeOpen: boolean
  processing: boolean
  onFocus: () => void
  onDone: () => void
  onSnooze: (days: number) => void
  onSnoozeToggle: () => void
  onReplyToggle: () => void
  onReplySave: () => void
}

function ItemRow({
  item,
  focused,
  replyOpen,
  snoozeOpen,
  processing,
  onFocus,
  onDone,
  onSnooze,
  onSnoozeToggle,
  onReplyToggle,
  onReplySave,
}: ItemRowProps) {
  const isCorr = item.kind === 'correspondence'

  let overdue = false
  if (isCorr && (item as CorrespondenceItem).due_at) {
    overdue = isOverdue((item as CorrespondenceItem).due_at!)
  }

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onClick={onFocus}
      className={`outline-none transition-colors ${focused ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'} ${overdue ? 'border-l-2 border-red-400' : 'border-l-2 border-transparent'}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Link
              href={`/businesses/${item.business_id}`}
              className="font-semibold text-gray-900 hover:text-[#2C4A6E] hover:underline text-sm"
              onClick={e => e.stopPropagation()}
            >
              {item.business_name}
            </Link>

            {isCorr && (item as CorrespondenceItem).contact_name && (
              <span className="text-xs text-gray-500">
                — {(item as CorrespondenceItem).contact_name}
                {(item as CorrespondenceItem).contact_role && ` (${(item as CorrespondenceItem).contact_role})`}
              </span>
            )}
          </div>

          {isCorr && (item as CorrespondenceItem).subject && (
            <p className="text-sm text-gray-800 mb-0.5">{(item as CorrespondenceItem).subject}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {isCorr && (item as CorrespondenceItem).action_needed !== 'none' && (
              <span className={`px-1.5 py-0.5 border text-[10px] font-semibold ${ACTION_COLOURS[(item as CorrespondenceItem).action_needed] || 'bg-gray-100 border-gray-300 text-gray-700'}`}>
                {ACTION_LABELS[(item as CorrespondenceItem).action_needed] || (item as CorrespondenceItem).action_needed}
              </span>
            )}

            {isCorr && (item as CorrespondenceItem).daysAgo !== undefined && (
              <span className="text-amber-700 font-medium">
                {(item as CorrespondenceItem).daysAgo} {(item as CorrespondenceItem).daysAgo === 1 ? 'day' : 'days'} ago
              </span>
            )}

            {isCorr && (item as CorrespondenceItem).due_at && (
              <span className={overdue ? 'text-red-700 font-semibold' : ''}>
                Due: {formatDateGB((item as CorrespondenceItem).due_at!)}
                {overdue && ' (overdue)'}
              </span>
            )}

            {isCorr && (item as CorrespondenceItem).entry_date && !(item as CorrespondenceItem).daysAgo && (
              <span>Entry: {formatDateTimeGB((item as CorrespondenceItem).entry_date!)}</span>
            )}

            {!isCorr && (
              <>
                <span>Last contact: {formatDateGB((item as BusinessItem).last_contacted_at)}</span>
                <span>{(item as BusinessItem).entry_count} {(item as BusinessItem).entry_count === 1 ? 'entry' : 'entries'}</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDone() }}
            disabled={processing}
            className="px-3 py-1 text-xs font-semibold bg-[#7C9A5E] text-white hover:bg-[#6a8550] transition-colors disabled:opacity-50"
          >
            {processing ? '…' : 'Done'}
          </button>

          <SnoozeDropdown
            open={snoozeOpen}
            onToggle={() => { onFocus(); onSnoozeToggle() }}
            onSnooze={onSnooze}
            disabled={processing}
          />

          <button
            onClick={e => { e.stopPropagation(); onReplyToggle() }}
            className={`px-3 py-1 text-xs font-medium border transition-colors ${replyOpen ? 'bg-[#2C4A6E] border-[#2C4A6E] text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Reply
          </button>
        </div>
      </div>

      {replyOpen && (
        <ReplyPanel
          businessId={item.business_id}
          contactId={isCorr ? (item as CorrespondenceItem).contact_id : null}
          onSave={onReplySave}
          onCancel={onReplyToggle}
        />
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const [needsReply, setNeedsReply] = useState<CorrespondenceItem[]>([])
  const [goneQuiet, setGoneQuiet] = useState<BusinessItem[]>([])
  const [flagged, setFlagged] = useState<CorrespondenceItem[]>([])
  const [reminders, setReminders] = useState<CorrespondenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    needs_reply: false,
    gone_quiet: false,
    flagged: false,
    reminders: false,
  })
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null)
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    const [nrResult, gqResult, flagResult, remResult] = await Promise.all([
      getNeedsReply(),
      getGoneQuiet(),
      getOutstandingActions(),
      getPureReminders(),
    ])

    if ('error' in nrResult && nrResult.error) { setError(nrResult.error); setLoading(false); return }
    if ('error' in gqResult && gqResult.error) { setError(gqResult.error); setLoading(false); return }
    if ('error' in flagResult && flagResult.error) { setError(flagResult.error); setLoading(false); return }
    if ('error' in remResult && remResult.error) { setError(remResult.error); setLoading(false); return }

    // Map to typed items
    setNeedsReply(
      (nrResult.data || []).map((e: Record<string, unknown>) => {
        const biz = e.businesses as { id: string; name: string } | null
        const contact = (Array.isArray(e.contact) ? e.contact[0] : e.contact) as { name: string; role: string | null } | null
        return {
          kind: 'correspondence' as const,
          id: e.id as string,
          business_id: biz?.id ?? (e.business_id as string),
          business_name: biz?.name ?? '',
          contact_id: e.contact_id as string | null,
          contact_name: contact?.name ?? null,
          contact_role: contact?.role ?? null,
          subject: e.subject as string | null,
          action_needed: e.action_needed as string,
          due_at: null,
          entry_date: e.entry_date as string | null,
          direction: e.direction as string | null,
          daysAgo: e.entry_date ? daysAgo(e.entry_date as string) : undefined,
        }
      })
    )

    setGoneQuiet(
      (gqResult.data || []).map((b: Record<string, unknown>) => {
        const countArr = b.correspondence as [{ count: number }] | undefined
        return {
          kind: 'business' as const,
          id: b.id as string,
          business_id: b.id as string,
          business_name: b.name as string,
          last_contacted_at: b.last_contacted_at as string,
          entry_count: countArr?.[0]?.count ?? 0,
        }
      })
    )

    const mapCorrEntry = (e: Record<string, unknown>): CorrespondenceItem => {
      const biz = e.businesses as { id: string; name: string } | null
      const contact = (Array.isArray(e.contact) ? e.contact[0] : e.contact) as { name: string; role: string | null } | null
      return {
        kind: 'correspondence',
        id: e.id as string,
        business_id: biz?.id ?? (e.business_id as string),
        business_name: biz?.name ?? '',
        contact_id: e.contact_id as string | null,
        contact_name: contact?.name ?? null,
        contact_role: contact?.role ?? null,
        subject: e.subject as string | null,
        action_needed: e.action_needed as string,
        due_at: e.due_at as string | null,
        entry_date: e.entry_date as string | null,
        direction: e.direction as string | null,
      }
    }

    setFlagged((flagResult.data || []).map(mapCorrEntry))
    setReminders((remResult.data || []).map(mapCorrEntry))

    setLoading(false)
  }

  // ── Flat ordered list for keyboard navigation ───────────────────────────────

  const allItems: Item[] = [
    ...(!collapsed.needs_reply ? needsReply : []),
    ...(!collapsed.gone_quiet ? goneQuiet : []),
    ...(!collapsed.flagged ? flagged : []),
    ...(!collapsed.reminders ? reminders : []),
  ]

  const focusedIndex = allItems.findIndex(item => item.id === focusedId)

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT') return

    const focused = focusedId ? allItems.find(i => i.id === focusedId) : null

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = focusedIndex < allItems.length - 1 ? allItems[focusedIndex + 1] : allItems[0]
      if (next) setFocusedId(next.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = focusedIndex > 0 ? allItems[focusedIndex - 1] : allItems[allItems.length - 1]
      if (prev) setFocusedId(prev.id)
    } else if (e.key === 'd' || e.key === 'D') {
      if (focused) handleDone(focused)
    } else if (e.key === 's' || e.key === 'S') {
      if (focused && focused.kind === 'correspondence') handleSnooze(focused.id, 7)
    } else if (e.key === 'r' || e.key === 'R') {
      if (focused) setReplyOpenId(id => id === focused.id ? null : focused.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, focusedIndex, allItems])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleDone(item: Item) {
    if (item.kind === 'correspondence') {
      setProcessingId(item.id)
      const result = await markCorrespondenceDone(item.id)
      if ('error' in result && result.error) {
        setError(result.error)
      } else {
        removeItem(item.id)
      }
      setProcessingId(null)
    } else {
      // Gone Quiet business — just remove from local state
      setGoneQuiet(prev => prev.filter(b => b.id !== item.id))
    }
  }

  async function handleSnooze(id: string, days: number) {
    setSnoozeOpenId(null)
    setProcessingId(id)
    const result = await snoozeCorrespondence(id, days)
    if ('error' in result && result.error) {
      setError(result.error)
    } else {
      removeItem(id)
    }
    setProcessingId(null)
  }

  function removeItem(id: string) {
    setNeedsReply(prev => prev.filter(i => i.id !== id))
    setFlagged(prev => prev.filter(i => i.id !== id))
    setReminders(prev => prev.filter(i => i.id !== id))
    if (replyOpenId === id) setReplyOpenId(null)
    if (focusedId === id) setFocusedId(null)
  }

  function toggleCollapse(section: SectionKey) {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const totalCount = needsReply.length + goneQuiet.length + flagged.length + reminders.length
  const allEmpty = totalCount === 0

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Lora, serif' }}>
            Actions
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Everything that needs your attention.</p>
        </div>
        <div className="text-right text-xs text-gray-400 leading-relaxed">
          <div className="font-medium text-gray-500 mb-0.5">Keyboard shortcuts</div>
          <div><kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">↑ ↓</kbd> navigate</div>
          <div><kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">D</kbd> done &nbsp; <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">S</kbd> snooze 7d &nbsp; <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">R</kbd> reply</div>
        </div>
      </div>

      {error && (
        <div className="border-2 border-red-400 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {allEmpty ? (
        <div className="border-2 border-[#7C9A5E] bg-green-50/30 p-10 text-center">
          <p className="text-lg text-gray-700 font-medium" style={{ fontFamily: 'Lora, serif' }}>
            All clear — nothing outstanding
          </p>
          <p className="text-gray-500 text-sm mt-1">{formatDateGB(new Date().toISOString())}</p>
        </div>
      ) : (
        <>
          {/* 1. Needs a Reply */}
          <Section
            title="Needs a Reply"
            count={needsReply.length}
            collapsed={collapsed.needs_reply}
            onToggle={() => toggleCollapse('needs_reply')}
          >
            {needsReply.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 italic">None</p>
            ) : (
              needsReply.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  focused={focusedId === item.id}
                  replyOpen={replyOpenId === item.id}
                  snoozeOpen={snoozeOpenId === item.id}
                  processing={processingId === item.id}
                  onFocus={() => setFocusedId(item.id)}
                  onDone={() => handleDone(item)}
                  onSnooze={days => handleSnooze(item.id, days)}
                  onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                  onReplyToggle={() => setReplyOpenId(id => id === item.id ? null : item.id)}
                  onReplySave={() => { removeItem(item.id) }}
                />
              ))
            )}
          </Section>

          {/* 2. Gone Quiet */}
          <Section
            title="Gone Quiet"
            count={goneQuiet.length}
            collapsed={collapsed.gone_quiet}
            onToggle={() => toggleCollapse('gone_quiet')}
          >
            {goneQuiet.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 italic">None</p>
            ) : (
              goneQuiet.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  focused={focusedId === item.id}
                  replyOpen={replyOpenId === item.id}
                  snoozeOpen={snoozeOpenId === item.id}
                  processing={processingId === item.id}
                  onFocus={() => setFocusedId(item.id)}
                  onDone={() => handleDone(item)}
                  onSnooze={() => { setGoneQuiet(prev => prev.filter(b => b.id !== item.id)); setSnoozeOpenId(null) }}
                  onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                  onReplyToggle={() => setReplyOpenId(id => id === item.id ? null : item.id)}
                  onReplySave={() => { setGoneQuiet(prev => prev.filter(b => b.id !== item.id)); setReplyOpenId(null) }}
                />
              ))
            )}
          </Section>

          {/* 3. Flagged Actions */}
          <Section
            title="Flagged Actions"
            count={flagged.length}
            collapsed={collapsed.flagged}
            onToggle={() => toggleCollapse('flagged')}
          >
            {flagged.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 italic">None</p>
            ) : (
              flagged.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  focused={focusedId === item.id}
                  replyOpen={replyOpenId === item.id}
                  snoozeOpen={snoozeOpenId === item.id}
                  processing={processingId === item.id}
                  onFocus={() => setFocusedId(item.id)}
                  onDone={() => handleDone(item)}
                  onSnooze={days => handleSnooze(item.id, days)}
                  onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                  onReplyToggle={() => setReplyOpenId(id => id === item.id ? null : item.id)}
                  onReplySave={() => { removeItem(item.id) }}
                />
              ))
            )}
          </Section>

          {/* 4. Upcoming Reminders */}
          <Section
            title="Upcoming Reminders"
            count={reminders.length}
            collapsed={collapsed.reminders}
            onToggle={() => toggleCollapse('reminders')}
          >
            {reminders.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 italic">None</p>
            ) : (
              reminders.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  focused={focusedId === item.id}
                  replyOpen={replyOpenId === item.id}
                  snoozeOpen={snoozeOpenId === item.id}
                  processing={processingId === item.id}
                  onFocus={() => setFocusedId(item.id)}
                  onDone={() => handleDone(item)}
                  onSnooze={days => handleSnooze(item.id, days)}
                  onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                  onReplyToggle={() => setReplyOpenId(id => id === item.id ? null : item.id)}
                  onReplySave={() => { removeItem(item.id) }}
                />
              ))
            )}
          </Section>
        </>
      )}
    </div>
  )
}

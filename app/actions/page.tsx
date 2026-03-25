'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
  type: string | null
  snippet: string | null
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

function makeSnippet(text: string | null | undefined): string | null {
  if (!text) return null
  const stripped = text.replace(/\*\*|__|[_*#>`~]/g, '').replace(/\s+/g, ' ').trim()
  if (stripped.length <= 150) return stripped
  return stripped.slice(0, 150).replace(/\s\S*$/, '') + '…'
}

/**
 * Heuristic filter: returns false if a received message almost certainly
 * doesn't need a reply (closers, acknowledgements, OOO, etc.).
 * Errs on the side of inclusion — only filters high-confidence non-replies.
 */
function likelyNeedsReply(item: CorrespondenceItem): boolean {
  const snippet = (item.snippet ?? '').toLowerCase()
  const subject = (item.subject ?? '').toLowerCase()

  // ── Auto-replies & OOO (subject-based) ───────────────────────────────────
  const autoSubjects = [
    'out of office', 'out of the office', 'auto-reply', 'auto reply',
    'automatic reply', 'autoreply', 'away from office', 'away from the office',
    'on holiday', 'on annual leave', 'on leave', 'on vacation', 'on maternity',
    'on paternity', 'do not reply', 'do not respond', 'noreply', 'no-reply',
    'delivery failed', 'undeliverable', 'mailer-daemon',
  ]
  if (autoSubjects.some(p => subject.includes(p))) return false

  // ── No content to judge — keep ────────────────────────────────────────────
  if (!snippet) return true

  // ── Override: explicit requests/questions always need a reply ────────────
  // These patterns take priority over any closer detection below.
  const requestPatterns = [
    /\?/,
    /\bplease\b/,
    /\bcould (you|we)\b/,
    /\bcan (you|we)\b/,
    /\bwould (you|mind)\b/,
    /\bwill you\b/,
    /\blet me know\b/,
    /\bget back (to me|to us)\b/,
    /\bsend (me|us|it|them|direct|over)\b/,
    /\bforward (it|this|the|me)\b/,
    /\bconfirm (receipt|that|whether|if)\b/,
    /\bneed (you|your|this|it|to)\b/,
    /\bwaiting (for|on)\b/,
    /\bawaiting\b/,
    /\bstill (need|haven't|waiting|outstanding)\b/,
    /\bhaven't (received|heard|got)\b/,
    /\bchase\b/,
    /\breminder\b/,
    /\basap\b/,
    /\burgent(ly)?\b/,
    /\bdeadline\b/,
    /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|end of|close of|cob|eod)\b/,
    /\bby (the )?([\d]{1,2}(st|nd|rd|th))\b/,
    /\bcall me\b/,
    /\bring me\b/,
    /\bemail me\b/,
    /\bdrop me\b/,
    /\bhave you\b/,
    /\bdid you\b/,
    /\bare you\b/,
    /\bwhen (can|will|are|is|do|does)\b/,
    /\bwhat (is|are|do|did|time|date|about|happened)\b/,
    /\bhow (do|does|can|should|would|much|many)\b/,
    /\bwhere (is|are|do|can|should)\b/,
    /\bwho (is|are|should|can|will)\b/,
    /\bwhy (is|are|did|has|have|hasn't|haven't)\b/,
  ]
  if (requestPatterns.some(p => p.test(snippet))) return true

  // Also check subject for request signals
  if (requestPatterns.some(p => p.test(subject))) return true

  // ── Strip emojis + punctuation for cleaner closer matching ───────────────
  const cleaned = snippet
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Strip leading salutations: "Hi Tom,", "Hello Sarah,", "Dear all," etc.
  const withoutSalutation = cleaned
    .replace(/^(hi|hello|hey|dear|good (morning|afternoon|evening|day))\s+\w+\s*/, '')
    .replace(/^(hi|hello|hey|dear)\s+(all|there|everyone|team|folks)\s*/, '')
    .trim()

  const words = withoutSalutation.split(' ').filter(Boolean)
  const wordCount = words.length

  // ── Pure closers: the entire message is just a sign-off ──────────────────
  const pureClosers = [
    /^thanks?( so much| very much| a lot| again| for (that|this|everything|your.*))?$/,
    /^thank you( so much| very much| for (that|this|everything|your.*))?$/,
    /^(many|much|big|huge) thanks?$/,
    /^(cheers|ta|ta very much)$/,
    /^(brilliant|great|perfect|wonderful|excellent|fantastic|fab|fabulous|superb|lovely)( thanks?| thank you)?$/,
    /^(brilliant|great|perfect|wonderful|excellent|fantastic|fab|superb|lovely)( stuff| one)?$/,
    /^noted( thanks?| thank you| with thanks)?$/,
    /^(received|acknowledged?)( thanks?| with thanks)?$/,
    /^(got it|got that)( thanks?| thank you)?$/,
    /^(understood|all understood)( thanks?)?$/,
    /^will do( thanks?)?$/,
    /^(sounds good|sounds great|that('s| is) (great|fine|good|perfect))( thanks?)?$/,
    /^no (problem|worries|probs|bother|rush)( at all)?( thanks?)?$/,
    /^(ok|okay|ok great|ok thanks|okey dokey|sure|fine|all good|all fine)$/,
    /^(of course|absolutely|certainly)( thanks?)?$/,
    /^much appreciated( thanks?| tom| everyone)?$/,
    /^(speak|talk|see you)( soon| then| later| next week| tomorrow)?$/,
    /^(have|enjoy) (a )?(good|great|lovely|nice|wonderful) (day|weekend|week|evening|one)$/,
    /^(all the best|best wishes|kind regards|warm regards|best regards|regards|yours (sincerely|faithfully))$/,
    /^(take care|take it easy)$/,
    /^(happy to help|glad (to|i could) help)( if (you need|anything else).*)?$/,
    /^(let me know if (you need|there('s| is) anything)|anything else (i can|let me know)).*$/,
    /^(consider it done|done|sorted|on it|on my way|heading over|leaving now)$/,
    /^(fyi|for your (info|information|records|reference))$/,
    /^(as discussed|as per our (call|conversation|chat|discussion|meeting|email))( (please find|i have|see|attached|below).*)?$/,
  ]

  if (wordCount <= 12 && pureClosers.some(p => p.test(withoutSalutation))) return false

  // ── Short message starting with a closer ─────────────────────────────────
  // e.g. "Thanks Tom, much appreciated. Best wishes, Sarah"
  // e.g. "Hi Tom, Brilliant, thanks! Best, Donna"
  if (wordCount <= 20) {
    const startsWithCloser = [
      /^thanks?\b/,
      /^thank you\b/,
      /^many thanks\b/,
      /^much appreciated\b/,
      /^noted\b/,
      /^(brilliant|great|perfect|wonderful|excellent|fantastic)\b/,
      /^cheers\b/,
      /^will do\b/,
      /^sounds good\b/,
      /^no (problem|worries)\b/,
      /^(received|got it|understood)\b/,
    ]
    if (startsWithCloser.some(p => p.test(withoutSalutation))) return false
  }

  return true
}

// ─── ReasonTag ────────────────────────────────────────────────────────────────

type ReasonTagProps = { text: string; colour: 'red' | 'amber' | 'olive' }
function ReasonTag({ text, colour }: ReasonTagProps) {
  const classes = {
    red:   'bg-red-50 border border-red-400 text-red-800',
    amber: 'bg-amber-50 border border-amber-400 text-amber-800',
    olive: 'bg-[#7C9A5E]/10 border border-[#7C9A5E]/40 text-[#5a7244]',
  }[colour]
  return <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-sm ${classes}`}>{text}</span>
}

// ─── Priority list ────────────────────────────────────────────────────────────

type PriorityEntry = {
  item: CorrespondenceItem
  reasonText: string
  reasonColour: 'red' | 'amber' | 'olive'
  urgencyScore: number
}

function buildPriorityList(
  needsReply: CorrespondenceItem[],
  flagged: CorrespondenceItem[],
): PriorityEntry[] {
  const now = Date.now()
  const DAY = 1000 * 60 * 60 * 24
  const seen = new Set<string>()
  const entries: PriorityEntry[] = []

  // Flagged items due within 7 days (or overdue)
  for (const item of flagged) {
    if (!item.due_at) continue
    const daysUntil = Math.ceil((new Date(item.due_at).getTime() - now) / DAY)
    if (daysUntil > 7) continue
    seen.add(item.id)

    let reasonText: string, reasonColour: 'red' | 'amber' | 'olive', urgencyScore: number
    if (daysUntil < 0) {
      const abs = Math.abs(daysUntil)
      reasonText = abs === 1 ? 'Overdue · 1 day' : `Overdue · ${abs} days`
      reasonColour = 'red'; urgencyScore = 1
    } else if (daysUntil === 0) {
      reasonText = 'Due today'; reasonColour = 'red'; urgencyScore = 2
    } else if (daysUntil === 1) {
      reasonText = 'Due tomorrow'; reasonColour = 'red'; urgencyScore = 3
    } else if (daysUntil <= 3) {
      reasonText = `Due in ${daysUntil} days`; reasonColour = 'amber'; urgencyScore = 4
    } else {
      reasonText = `Due in ${daysUntil} days`; reasonColour = 'olive'; urgencyScore = 7
    }
    entries.push({ item, reasonText, reasonColour, urgencyScore })
  }

  // Needs reply >= 3 days (not already captured from flagged)
  for (const item of needsReply) {
    if (seen.has(item.id)) continue
    const days = item.daysAgo ?? 0
    if (days < 3) continue
    const reasonText = days >= 7 ? `Overdue reply · ${days} days` : `No reply · ${days} days`
    const reasonColour: 'red' | 'amber' = days >= 7 ? 'red' : 'amber'
    const urgencyScore = days >= 7 ? 5 : 6
    entries.push({ item, reasonText, reasonColour, urgencyScore })
  }

  // Sort: urgencyScore ASC, then secondary (earliest due / most days ago)
  entries.sort((a, b) => {
    if (a.urgencyScore !== b.urgencyScore) return a.urgencyScore - b.urgencyScore
    if (a.urgencyScore <= 4 && a.item.due_at && b.item.due_at)
      return new Date(a.item.due_at).getTime() - new Date(b.item.due_at).getTime()
    return (b.item.daysAgo ?? 0) - (a.item.daysAgo ?? 0)
  })

  return entries
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
  reasonTag?: React.ReactNode
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
  reasonTag,
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

          {isCorr && ((item as CorrespondenceItem).direction || (item as CorrespondenceItem).snippet) && (
            <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
              {(item as CorrespondenceItem).direction === 'received' && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-[#2C4A6E]/8 text-[#2C4A6E] border border-[#2C4A6E]/20">↓ Received</span>
              )}
              {(item as CorrespondenceItem).direction === 'sent' && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-[#7C9A5E]/10 text-[#7C9A5E] border border-[#7C9A5E]/20">↑ Sent</span>
              )}
              {(item as CorrespondenceItem).snippet && (
                <span className="text-xs text-gray-400 italic">{(item as CorrespondenceItem).snippet}</span>
              )}
            </div>
          )}

          {reasonTag && <div className="mt-0.5 mb-1">{reasonTag}</div>}

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
    needs_reply: true,
    gone_quiet: true,
    flagged: true,
    reminders: true,
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
          type: e.type as string | null,
          snippet: makeSnippet(e.formatted_text_current as string | null),
          daysAgo: e.entry_date ? daysAgo(e.entry_date as string) : undefined,
        }
      }).filter(likelyNeedsReply)
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
        type: e.type as string | null,
        snippet: makeSnippet(e.formatted_text_current as string | null),
      }
    }

    setFlagged((flagResult.data || []).map(mapCorrEntry))
    setReminders((remResult.data || []).map(mapCorrEntry))

    setLoading(false)
  }

  // ── Priority list (derived, no extra fetch) ──────────────────────────────────

  const priorityList = useMemo(
    () => buildPriorityList(needsReply, flagged),
    [needsReply, flagged]
  )

  // ── Flat ordered list for keyboard navigation ───────────────────────────────

  const allItems: Item[] = useMemo(() => {
    const seen = new Set<string>()
    const result: Item[] = []
    for (const { item } of priorityList) { seen.add(item.id); result.push(item) }
    if (!collapsed.needs_reply) needsReply.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); result.push(i) } })
    if (!collapsed.gone_quiet) goneQuiet.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); result.push(i) } })
    if (!collapsed.flagged) flagged.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); result.push(i) } })
    if (!collapsed.reminders) reminders.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); result.push(i) } })
    return result
  }, [priorityList, collapsed, needsReply, goneQuiet, flagged, reminders])

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

      {/* Priority section — always shown */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Lora, serif' }}>
          Needs Your Attention
          {priorityList.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">({priorityList.length})</span>
          )}
        </h2>

        {priorityList.length === 0 ? (
          <div className="border border-[#7C9A5E]/40 bg-green-50/30 px-6 py-4 flex items-center gap-3 rounded-sm">
            <span className="text-[#7C9A5E] font-bold">✓</span>
            <div>
              <p className="text-sm font-medium text-gray-700">You&apos;re on top of it</p>
              <p className="text-xs text-gray-400 mt-0.5">{formatDateGB(new Date().toISOString())}</p>
            </div>
          </div>
        ) : (
          <div className="border-2 border-gray-200 bg-white divide-y divide-gray-100">
            {priorityList.map(({ item, reasonText, reasonColour }) => (
              <ItemRow
                key={`priority-${item.id}`}
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
                onReplySave={() => removeItem(item.id)}
                reasonTag={<ReasonTag text={reasonText} colour={reasonColour} />}
              />
            ))}
          </div>
        )}
      </div>

      {!allEmpty && (
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


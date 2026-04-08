'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  getNeedsReply,
  getGoneQuiet,
  getOutstandingActions,
  getPureReminders,
  getContractExpiries,
  markCorrespondenceDone,
  snoozeCorrespondence,
  createCorrespondence,
} from '@/app/actions/correspondence'
import { formatDateGB } from '@/lib/utils'
import { toast } from '@/lib/toast'

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

type ContractItem = {
  kind: 'contract'
  id: string
  business_id: string
  business_name: string
  contract_end: string
  contract_amount: number | null
  contract_currency: string | null
}

type Badge = 'REPLY' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_TOMORROW' | 'DUE_SOON' | 'FLAG' | 'RENEWAL' | 'QUIET' | 'REMINDER'

type UnifiedItem = (CorrespondenceItem | BusinessItem | ContractItem) & {
  badge: Badge
  urgencyScore: number
  badgeLabel: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  follow_up: 'Follow-up',
  waiting_on_them: 'Waiting on them',
  invoice: 'Invoice',
  renewal: 'Renewal',
  prospect: 'Prospect',
}

const ACTION_COLOURS: Record<string, string> = {
  follow_up: 'bg-brand-navy/[0.07] border-brand-navy/25 text-brand-navy',
  waiting_on_them: 'bg-amber-50 border-amber-300 text-amber-800',
  invoice: 'bg-orange-50 border-orange-300 text-orange-800',
  renewal: 'bg-brand-olive/10 border-brand-olive/40 text-[#5a7244]',
  prospect: 'bg-emerald-50 border-emerald-300 text-emerald-800',
}

const BADGE_CLASSES: Record<Badge, string> = {
  REPLY:        'bg-amber-50 border border-amber-400 text-amber-900',   // overridden per-item for 7+ days
  OVERDUE:      'bg-red-50 border border-red-400 text-red-800',
  DUE_TODAY:    'bg-red-50 border border-red-400 text-red-800',
  DUE_TOMORROW: 'bg-amber-50 border border-amber-400 text-amber-800',
  DUE_SOON:     'bg-amber-50 border border-amber-300 text-amber-800',
  FLAG:         'bg-brand-olive/10 border border-brand-olive/40 text-[#5a7244]',
  RENEWAL:      'bg-brand-olive/10 border border-brand-olive/40 text-[#5a7244]',
  QUIET:        'bg-slate-50 border border-slate-300 text-slate-700',
  REMINDER:     'bg-gray-50 border border-gray-300 text-gray-600',
}

function getBadgeClass(item: UnifiedItem): string {
  if (item.badge === 'REPLY') {
    const days = (item as CorrespondenceItem).daysAgo ?? 0
    return days >= 7
      ? 'bg-red-50 border border-red-400 text-red-800'
      : 'bg-amber-50 border border-amber-400 text-amber-900'
  }
  return BADGE_CLASSES[item.badge]
}

const LEFT_BORDER: Record<Badge, string> = {
  REPLY:        'border-l-2 border-amber-400',
  OVERDUE:      'border-l-2 border-red-500',
  DUE_TODAY:    'border-l-2 border-red-400',
  DUE_TOMORROW: 'border-l-2 border-amber-400',
  DUE_SOON:     'border-l-2 border-amber-300',
  FLAG:         'border-l-2 border-brand-olive/60',
  RENEWAL:      'border-l-2 border-brand-olive/60',
  QUIET:        'border-l-2 border-slate-300',
  REMINDER:     'border-l-2 border-transparent',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgoFn(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function daysUntilFn(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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

  const autoSubjects = [
    'out of office', 'out of the office', 'auto-reply', 'auto reply',
    'automatic reply', 'autoreply', 'away from office', 'away from the office',
    'on holiday', 'on annual leave', 'on leave', 'on vacation', 'on maternity',
    'on paternity', 'do not reply', 'do not respond', 'noreply', 'no-reply',
    'delivery failed', 'undeliverable', 'mailer-daemon',
  ]
  if (autoSubjects.some(p => subject.includes(p))) return false

  if (!snippet) return true

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
  if (requestPatterns.some(p => p.test(subject))) return true

  const cleaned = snippet
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  let withoutSalutation = cleaned
    .replace(/^(hi|hello|hey|dear|good (morning|afternoon|evening|day))\s+\w+\s*/, '')
    .replace(/^(hi|hello|hey|dear)\s+(all|there|everyone|team|folks)\s*/, '')
    .trim()

  // Strip email signature content — addresses and phone numbers inflate word count
  // and prevent closer detection on messages like "Wonderful, thanks! Kind regards, Jane, 1st Floor..."
  const signatureMarkers = [
    /\bkind regards\b/, /\bbest regards?\b/, /\bwarm regards?\b/,
    /\byours (sincerely|faithfully|truly)\b/, /\ball the best\b/,
    /\bwith (kind |warm |best |many )?regards?\b/, /\bbest wishes\b/,
    /\bthanks and regards\b/, /\bwith thanks\b/,
  ]
  for (const marker of signatureMarkers) {
    const match = withoutSalutation.search(marker)
    if (match > 0) {
      withoutSalutation = withoutSalutation.slice(0, match).trim()
      break
    }
  }

  const words = withoutSalutation.split(' ').filter(Boolean)
  const wordCount = words.length

  const pureClosers = [
    /^thanks?( so much| very much| a lot| again| for (that|this|everything|your.*))?$/,
    /^thank you( so much| very much| for (that|this|everything|your.*))?$/,
    /^(many|much|big|huge) thanks?$/,
    /^(cheers|ta|ta very much)$/,
    /^(brilliant|great|perfect|wonderful|excellent|fantastic|fab|fabulous|superb|lovely)( thanks?| thank you)?$/,
    /^(brilliant|great|perfect|wonderful|excellent|fantastic|fab|superb|lovely)( stuff| one)?$/,
    /^that (would be|sounds|is) (wonderful|great|perfect|brilliant|lovely|amazing|fantastic)( thanks?| thank you( very much| so much)?)?$/,
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
      /^that (would|sounds) (be )?(wonderful|great|perfect|brilliant|lovely|amazing)\b/,
    ]
    if (startsWithCloser.some(p => p.test(withoutSalutation))) return false
  }

  return true
}

function buildUnifiedList(
  needsReply: CorrespondenceItem[],
  goneQuiet: BusinessItem[],
  flagged: CorrespondenceItem[],
  reminders: CorrespondenceItem[],
  contracts: ContractItem[],
): UnifiedItem[] {
  const corrSeen = new Set<string>()
  const bizSeen = new Set<string>()
  const items: UnifiedItem[] = []

  // 1. REPLY — always first, sorted by age (oldest = most urgent)
  for (const item of needsReply) {
    if (corrSeen.has(item.id)) continue
    corrSeen.add(item.id)
    const days = item.daysAgo ?? 0
    items.push({
      ...item,
      badge: 'REPLY',
      urgencyScore: days >= 7 ? 1 : 2,
      badgeLabel: days === 1 ? 'No reply · 1 day' : `No reply · ${days} days`,
    })
  }

  // 2. Flagged — sorted by due date urgency
  for (const item of flagged) {
    if (corrSeen.has(item.id)) continue
    corrSeen.add(item.id)
    if (!item.due_at) {
      items.push({ ...item, badge: 'FLAG', urgencyScore: 8, badgeLabel: 'Flagged' })
      continue
    }
    const until = daysUntilFn(item.due_at)
    let badge: Badge, urgencyScore: number, badgeLabel: string
    if (until < 0) {
      const abs = Math.abs(until)
      badge = 'OVERDUE'; urgencyScore = 3
      badgeLabel = abs === 1 ? 'Overdue · 1 day' : `Overdue · ${abs} days`
    } else if (until === 0) {
      badge = 'DUE_TODAY'; urgencyScore = 4; badgeLabel = 'Due today'
    } else if (until === 1) {
      badge = 'DUE_TOMORROW'; urgencyScore = 5; badgeLabel = 'Due tomorrow'
    } else if (until <= 3) {
      badge = 'DUE_SOON'; urgencyScore = 6; badgeLabel = `Due in ${until} days`
    } else {
      badge = 'FLAG'; urgencyScore = 8; badgeLabel = `Due ${formatDateGB(item.due_at)}`
    }
    items.push({ ...item, badge, urgencyScore, badgeLabel })
  }

  // 3. Contract expiries — before gone quiet, after flagged
  for (const item of contracts) {
    if (bizSeen.has(item.business_id)) continue
    bizSeen.add(item.business_id)
    const until = daysUntilFn(item.contract_end)
    const urgencyScore = until < 7 ? 7 : 9
    items.push({
      ...item,
      badge: 'RENEWAL',
      urgencyScore,
      badgeLabel: `Contract ends ${formatDateGB(item.contract_end)}`,
    })
  }

  // 4. Gone quiet businesses (skip if already shown as contract)
  for (const item of goneQuiet) {
    if (bizSeen.has(item.business_id)) continue
    bizSeen.add(item.business_id)
    const days = daysAgoFn(item.last_contacted_at)
    items.push({
      ...item,
      badge: 'QUIET',
      urgencyScore: 10,
      badgeLabel: `Quiet · ${days} days`,
    })
  }

  // 5. Reminders
  for (const item of reminders) {
    if (corrSeen.has(item.id)) continue
    corrSeen.add(item.id)
    items.push({
      ...item,
      badge: 'REMINDER',
      urgencyScore: 11,
      badgeLabel: item.due_at ? `Due ${formatDateGB(item.due_at)}` : 'Reminder',
    })
  }

  // Sort: urgencyScore ASC, then secondary
  items.sort((a, b) => {
    if (a.urgencyScore !== b.urgencyScore) return a.urgencyScore - b.urgencyScore
    // Within same urgency: replies = oldest first; flagged = earliest due first
    if (a.badge === 'REPLY' && b.badge === 'REPLY') {
      const aD = (a as CorrespondenceItem).daysAgo ?? 0
      const bD = (b as CorrespondenceItem).daysAgo ?? 0
      return bD - aD
    }
    if (a.kind === 'correspondence' && b.kind === 'correspondence') {
      const aC = a as CorrespondenceItem; const bC = b as CorrespondenceItem
      if (aC.due_at && bC.due_at) return new Date(aC.due_at).getTime() - new Date(bC.due_at).getTime()
    }
    if (a.kind === 'contract' && b.kind === 'contract') {
      return new Date((a as ContractItem).contract_end).getTime() - new Date((b as ContractItem).contract_end).getTime()
    }
    return 0
  })

  return items
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

type CollapsibleSectionProps = {
  title: string
  count: number
  defaultExpanded?: boolean
  subtitle?: string
  children: React.ReactNode
}
function CollapsibleSection({ title, count, defaultExpanded = false, subtitle, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultExpanded)
  if (count === 0) return null
  return (
    <div className="border border-gray-200 bg-white mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-gray-100 border border-gray-200 text-gray-600 text-[11px] font-semibold rounded-sm shrink-0">
            {count}
          </span>
          {subtitle && !open && (
            <span className="text-[11px] text-gray-400 truncate hidden sm:block">{subtitle}</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ml-2 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── QuietRow ─────────────────────────────────────────────────────────────────

type QuietRowProps = {
  item: BusinessItem & { badge: Badge; urgencyScore: number; badgeLabel: string }
  logOpen: boolean
  onLogToggle: () => void
  onLogSave: (markDone: boolean) => void
  onDone: () => void
}
function QuietRow({ item, logOpen, onLogToggle, onLogSave, onDone }: QuietRowProps) {
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/businesses/${item.business_id}`}
              className="font-medium text-gray-900 hover:text-brand-navy hover:underline text-sm"
              onClick={e => e.stopPropagation()}
            >
              {item.business_name}
            </Link>
            <span className="text-xs text-gray-400">{item.badgeLabel}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{item.entry_count} {item.entry_count === 1 ? 'entry' : 'entries'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDone() }}
            className="px-2.5 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={e => { e.stopPropagation(); onLogToggle() }}
            className={`px-2.5 py-1 text-xs font-medium border transition-colors ${logOpen ? 'bg-brand-navy border-brand-navy text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Log
          </button>
        </div>
      </div>
      {logOpen && (
        <LogPanel
          businessId={item.business_id}
          contactId={null}
          showMarkDone={false}
          onSave={onLogSave}
          onCancel={onLogToggle}
        />
      )}
    </div>
  )
}

// ─── SnoozeDropdown ───────────────────────────────────────────────────────────

type SnoozeProps = { open: boolean; onToggle: () => void; onSnooze: (days: number) => void; disabled: boolean }
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
          {[{ label: '3 days', days: 3 }, { label: '1 week', days: 7 }, { label: '1 month', days: 30 }].map(({ label, days }) => (
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

// ─── LogPanel (enhanced quick log) ───────────────────────────────────────────

type LogPanelProps = {
  businessId: string
  contactId: string | null
  showMarkDone: boolean
  onSave: (markDone: boolean) => void
  onCancel: () => void
}

function LogPanel({ businessId, contactId, showMarkDone, onSave, onCancel }: LogPanelProps) {
  const [text, setText] = useState('')
  const [logType, setLogType] = useState<'Note' | 'Call' | 'Email'>('Note')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])
  const [logTime, setLogTime] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [markDone, setMarkDone] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    let entryDate: string
    try {
      entryDate = logTime
        ? new Date(`${logDate}T${logTime}`).toISOString()
        : new Date(`${logDate}T12:00:00`).toISOString()
    } catch {
      entryDate = new Date().toISOString()
    }
    const result = await createCorrespondence({
      business_id: businessId,
      contact_id: contactId || undefined,
      raw_text_original: text.trim(),
      direction: 'sent',
      type: logType,
      entry_date: entryDate,
    })
    if ('error' in result && result.error) {
      setError(result.error)
      setSaving(false)
    } else {
      onSave(markDone)
    }
  }

  const placeholder = logType === 'Call' ? 'What was discussed…' : logType === 'Email' ? 'What did you send…' : 'Add a note…'

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        <select
          value={logType}
          onChange={e => setLogType(e.target.value as 'Note' | 'Call' | 'Email')}
          className="text-xs border border-gray-300 px-2 py-1.5 bg-white focus:outline-none focus:border-brand-navy"
        >
          <option value="Note">Note</option>
          <option value="Call">Call</option>
          <option value="Email">Email</option>
        </select>
        <input
          type="date"
          value={logDate}
          onChange={e => setLogDate(e.target.value)}
          className="text-xs border border-gray-300 px-2 py-1.5 bg-white focus:outline-none focus:border-brand-navy"
        />
        <input
          type="time"
          value={logTime}
          onChange={e => setLogTime(e.target.value)}
          className="text-xs border border-gray-300 px-2 py-1.5 bg-white focus:outline-none focus:border-brand-navy w-24"
        />
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full text-sm border border-gray-300 px-3 py-2 resize-none focus:outline-none focus:border-brand-navy"
      />
      {error && <p className="text-red-700 text-xs mt-1">{error}</p>}
      <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
        {showMarkDone ? (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={markDone}
              onChange={e => setMarkDone(e.target.checked)}
              className="accent-brand-navy"
            />
            Mark original as done
          </label>
        ) : <span />}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="px-3 py-1 text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

type ItemRowProps = {
  item: UnifiedItem
  focused: boolean
  logOpen: boolean
  snoozeOpen: boolean
  processing: boolean
  onFocus: () => void
  onDone: () => void
  onSnooze: (days: number) => void
  onSnoozeToggle: () => void
  onLogToggle: () => void
  onLogSave: (markDone: boolean) => void
}

function ItemRow({ item, focused, logOpen, snoozeOpen, processing, onFocus, onDone, onSnooze, onSnoozeToggle, onLogToggle, onLogSave }: ItemRowProps) {
  const isCorr = item.kind === 'correspondence'
  const isContract = item.kind === 'contract'
  const isBusiness = item.kind === 'business'
  const corr = isCorr ? (item as CorrespondenceItem) : null
  const contract = isContract ? (item as ContractItem) : null
  const biz = isBusiness ? (item as BusinessItem) : null

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onClick={onFocus}
      className={`outline-none transition-colors ${focused ? 'bg-brand-navy/[0.04]' : 'hover:bg-gray-50/60'} ${LEFT_BORDER[item.badge]}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          {/* Badge + action type inline */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded-sm ${getBadgeClass(item)}`}>
              {item.badgeLabel}
            </span>
            {corr?.action_needed && corr.action_needed !== 'none' && (
              <span className={`inline-block px-1.5 py-0.5 border text-[10px] font-semibold rounded-sm ${ACTION_COLOURS[corr.action_needed] || 'bg-gray-100 border-gray-300 text-gray-700'}`}>
                {ACTION_LABELS[corr.action_needed] || corr.action_needed}
              </span>
            )}
          </div>

          {/* Business + contact */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Link
              href={`/businesses/${item.business_id}`}
              className="font-semibold text-gray-900 hover:text-brand-navy hover:underline text-sm"
              onClick={e => e.stopPropagation()}
            >
              {item.business_name}
            </Link>
            {corr?.contact_name && (
              <span className="text-xs text-gray-500">
                — {corr.contact_name}{corr.contact_role && ` (${corr.contact_role})`}
              </span>
            )}
          </div>

          {/* Subject */}
          {corr?.subject && (
            <p className="text-sm text-gray-800 mb-0.5">{corr.subject}</p>
          )}

          {/* Direction + snippet */}
          {corr && (corr.direction || corr.snippet) && (
            <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
              {corr.direction === 'received' && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-brand-navy/8 text-brand-navy border border-brand-navy/20">↓ Received</span>
              )}
              {corr.direction === 'sent' && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-brand-olive/10 text-brand-olive border border-brand-olive/20">↑ Sent</span>
              )}
              {corr.snippet && (
                <span className="text-xs text-gray-400 italic">{corr.snippet}</span>
              )}
            </div>
          )}

          {/* Contract details + nudge */}
          {contract && (
            <div className="text-xs text-gray-500 mb-0.5">
              {contract.contract_amount && (
                <span>{contract.contract_currency || '£'}{contract.contract_amount.toLocaleString()} · </span>
              )}
              <span className="text-gray-400 italic">Consider discussing renewal before this date.</span>
            </div>
          )}

          {/* Gone quiet detail + nudge */}
          {biz && (
            <div className="text-xs text-gray-500 mb-0.5">
              Last contact: {formatDateGB(biz.last_contacted_at)} · {biz.entry_count} {biz.entry_count === 1 ? 'entry' : 'entries'}
              <span className="text-gray-400 italic ml-1">— worth a nudge?</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDone() }}
            disabled={processing}
            className="px-3 py-1 text-xs font-semibold bg-brand-olive text-white hover:bg-[#6a8550] transition-colors disabled:opacity-50"
          >
            {processing ? '…' : 'Done'}
          </button>

          {isCorr && (
            <SnoozeDropdown
              open={snoozeOpen}
              onToggle={() => { onFocus(); onSnoozeToggle() }}
              onSnooze={onSnooze}
              disabled={processing}
            />
          )}

          <button
            onClick={e => { e.stopPropagation(); onLogToggle() }}
            className={`px-3 py-1 text-xs font-medium border transition-colors ${logOpen ? 'bg-brand-navy border-brand-navy text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {item.badge === 'REPLY' ? 'Reply' : 'Log'}
          </button>
        </div>
      </div>

      {logOpen && (
        <LogPanel
          businessId={item.business_id}
          contactId={isCorr ? corr!.contact_id : null}
          showMarkDone={isCorr}
          onSave={onLogSave}
          onCancel={onLogToggle}
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
  const [contracts, setContracts] = useState<ContractItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [logOpenId, setLogOpenId] = useState<string | null>(null)
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    const [nrResult, gqResult, flagResult, remResult, contractResult] = await Promise.all([
      getNeedsReply(),
      getGoneQuiet(),
      getOutstandingActions(),
      getPureReminders(),
      getContractExpiries(),
    ])

    if ('error' in nrResult && nrResult.error) { setError(nrResult.error); setLoading(false); return }
    if ('error' in gqResult && gqResult.error) { setError(gqResult.error); setLoading(false); return }
    if ('error' in flagResult && flagResult.error) { setError(flagResult.error); setLoading(false); return }
    if ('error' in remResult && remResult.error) { setError(remResult.error); setLoading(false); return }
    // Contract errors are non-fatal — just skip
    const contractData = contractResult && !('error' in contractResult) ? contractResult.data || [] : []

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

    setNeedsReply(
      (nrResult.data || []).map((e: Record<string, unknown>) => {
        const item = mapCorrEntry(e)
        return { ...item, due_at: null, daysAgo: e.entry_date ? daysAgoFn(e.entry_date as string) : undefined }
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

    setFlagged((flagResult.data || []).map(mapCorrEntry))
    setReminders((remResult.data || []).map(mapCorrEntry))

    setContracts(
      contractData.map((b: Record<string, unknown>) => ({
        kind: 'contract' as const,
        id: b.id as string,
        business_id: b.id as string,
        business_name: b.name as string,
        contract_end: b.contract_end as string,
        contract_amount: b.contract_amount as number | null,
        contract_currency: b.contract_currency as string | null,
      }))
    )

    setLoading(false)
  }

  // ── Unified list ────────────────────────────────────────────────────────────

  const unifiedList = useMemo(
    () => buildUnifiedList(needsReply, goneQuiet, flagged, reminders, contracts),
    [needsReply, goneQuiet, flagged, reminders, contracts]
  )

  const focusedIndex = unifiedList.findIndex(item => item.id === focusedId)

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return

    const focused = focusedId ? unifiedList.find(i => i.id === focusedId) : null

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = focusedIndex < unifiedList.length - 1 ? unifiedList[focusedIndex + 1] : unifiedList[0]
      if (next) setFocusedId(next.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = focusedIndex > 0 ? unifiedList[focusedIndex - 1] : unifiedList[unifiedList.length - 1]
      if (prev) setFocusedId(prev.id)
    } else if ((e.key === 'd' || e.key === 'D') && focused) {
      handleDone(focused)
    } else if ((e.key === 's' || e.key === 'S') && focused && focused.kind === 'correspondence') {
      handleSnooze(focused.id, 7)
    } else if ((e.key === 'l' || e.key === 'L') && focused) {
      setLogOpenId(id => id === focused.id ? null : focused.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, focusedIndex, unifiedList])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleDone(item: UnifiedItem) {
    if (item.kind === 'correspondence') {
      setProcessingId(item.id)
      const result = await markCorrespondenceDone(item.id)
      if ('error' in result && result.error) {
        setError(result.error)
        toast.error('Failed to mark done')
      } else {
        removeItem(item.id)
        toast.success('Marked done')
      }
      setProcessingId(null)
    } else {
      // Business / contract — local dismiss only
      removeItem(item.id)
      toast.success('Dismissed')
    }
  }

  async function handleSnooze(id: string, days: number) {
    setSnoozeOpenId(null)
    setProcessingId(id)
    const result = await snoozeCorrespondence(id, days)
    if ('error' in result && result.error) {
      setError(result.error)
      toast.error('Failed to snooze')
    } else {
      removeItem(id)
      const label = days === 3 ? '3 days' : days === 7 ? '1 week' : '1 month'
      toast.success(`Snoozed for ${label}`)
    }
    setProcessingId(null)
  }

  function handleLogSave(item: UnifiedItem, markDone: boolean) {
    removeItem(item.id)
    setLogOpenId(null)
    toast.success('Logged')
    // Fire-and-forget: mark done in background
    if (markDone && item.kind === 'correspondence') {
      markCorrespondenceDone(item.id)
    }
  }

  function removeItem(id: string) {
    setNeedsReply(prev => prev.filter(i => i.id !== id))
    setFlagged(prev => prev.filter(i => i.id !== id))
    setReminders(prev => prev.filter(i => i.id !== id))
    setGoneQuiet(prev => prev.filter(i => i.id !== id))
    setContracts(prev => prev.filter(i => i.id !== id))
    if (logOpenId === id) setLogOpenId(null)
    if (focusedId === id) setFocusedId(null)
  }

  const allEmpty = unifiedList.length === 0

  const sections = useMemo(() => {
    const reply     = unifiedList.filter(i => i.badge === 'REPLY')
    const actions   = unifiedList.filter(i => ['OVERDUE', 'DUE_TODAY', 'DUE_TOMORROW', 'DUE_SOON', 'FLAG'].includes(i.badge))
    const renewals  = unifiedList.filter(i => i.badge === 'RENEWAL')
    const quiet     = unifiedList.filter(i => i.badge === 'QUIET')
    const reminders = unifiedList.filter(i => i.badge === 'REMINDER')

    const urgentRenewal = renewals.some(i => {
      const c = i as ContractItem & { badge: Badge; urgencyScore: number; badgeLabel: string }
      return daysUntilFn(c.contract_end) < 7
    })

    // Section subtitles — brief breakdown of what's inside
    const oldestReply = reply.length ? Math.max(...reply.map(i => (i as CorrespondenceItem).daysAgo ?? 0)) : 0
    const replySubtitle = reply.length
      ? `oldest ${oldestReply} days · ${reply.filter(i => ((i as CorrespondenceItem).daysAgo ?? 0) >= 7).length} overdue`
      : ''

    const overdue   = actions.filter(i => i.badge === 'OVERDUE').length
    const dueToday  = actions.filter(i => i.badge === 'DUE_TODAY').length
    const flagged   = actions.filter(i => i.badge === 'FLAG').length
    const actParts: string[] = []
    if (overdue)  actParts.push(`${overdue} overdue`)
    if (dueToday) actParts.push(`${dueToday} due today`)
    if (flagged)  actParts.push(`${flagged} flagged`)
    const actionsSubtitle = actParts.join(' · ')

    const renewalSubtitle = renewals.length
      ? renewals.map(i => {
          const c = i as ContractItem & { badge: Badge; urgencyScore: number; badgeLabel: string }
          const days = daysUntilFn(c.contract_end)
          return days < 7 ? `${c.business_name} — ${days}d` : c.business_name
        }).join(', ')
      : ''

    return { reply, actions, renewals, quiet, reminders, urgentRenewal, replySubtitle, actionsSubtitle, renewalSubtitle }
  }, [unifiedList])

  const urgentSummary = useMemo(() => {
    const parts: string[] = []
    if (sections.reply.length) parts.push(`${sections.reply.length} ${sections.reply.length === 1 ? 'reply' : 'replies'} needed`)
    if (sections.actions.length) parts.push(`${sections.actions.length} action${sections.actions.length === 1 ? '' : 's'} due`)
    return parts.join(' · ')
  }, [sections])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 animate-pulse" />
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
          <p className="text-gray-500 text-sm mt-0.5">
            {allEmpty ? 'Nothing outstanding.' : urgentSummary || 'Nothing urgent right now.'}
          </p>
        </div>
        <div className="text-right text-xs text-gray-400 leading-relaxed hidden sm:block">
          <div className="font-medium text-gray-500 mb-0.5">Keyboard shortcuts</div>
          <div><kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">↑ ↓</kbd> navigate</div>
          <div>
            <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">D</kbd> done &nbsp;
            <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">S</kbd> snooze 7d &nbsp;
            <kbd className="bg-gray-100 border border-gray-300 px-1 rounded text-[10px]">L</kbd> reply / log
          </div>
        </div>
      </div>

      {error && (
        <div className="border-2 border-red-400 bg-red-50 px-4 py-3 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {allEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-olive/10 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-brand-olive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1" style={{ fontFamily: 'Lora, serif' }}>
            You&apos;re all caught up
          </h2>
          <p className="text-sm text-gray-400 mb-6">Nothing needs your attention right now.</p>
          <Link href="/dashboard" className="text-sm text-brand-navy hover:underline">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <>
          {/* Needs Reply */}
          <CollapsibleSection title="Needs Reply" count={sections.reply.length} subtitle={sections.replySubtitle}>
            {sections.reply.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>

          {/* Actions Due */}
          <CollapsibleSection title="Actions Due" count={sections.actions.length} subtitle={sections.actionsSubtitle}>
            {sections.actions.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>

          {/* Renewals */}
          <CollapsibleSection title="Renewals" count={sections.renewals.length} defaultExpanded={sections.urgentRenewal} subtitle={sections.renewalSubtitle}>
            {sections.renewals.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>

          {/* Gone Quiet — compact rows */}
          <CollapsibleSection
            title="Gone Quiet"
            count={sections.quiet.length}
            subtitle="businesses not contacted in 60+ days"
          >
            {sections.quiet.map(item => (
              <QuietRow
                key={item.id}
                item={item as BusinessItem & { badge: Badge; urgencyScore: number; badgeLabel: string }}
                logOpen={logOpenId === item.id}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
                onDone={() => handleDone(item)}
              />
            ))}
          </CollapsibleSection>

          {/* Reminders */}
          <CollapsibleSection title="Reminders" count={sections.reminders.length}>
            {sections.reminders.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                focused={focusedId === item.id}
                logOpen={logOpenId === item.id}
                snoozeOpen={snoozeOpenId === item.id}
                processing={processingId === item.id}
                onFocus={() => setFocusedId(item.id)}
                onDone={() => handleDone(item)}
                onSnooze={days => handleSnooze(item.id, days)}
                onSnoozeToggle={() => setSnoozeOpenId(id => id === item.id ? null : item.id)}
                onLogToggle={() => setLogOpenId(id => id === item.id ? null : item.id)}
                onLogSave={markDone => handleLogSave(item, markDone)}
              />
            ))}
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}

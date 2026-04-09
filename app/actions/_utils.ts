// Shared helpers and constants for the Actions page

import { formatDateGB } from '@/lib/utils'
import type { Badge, CorrespondenceItem, UnifiedItem } from './_types'

export const ACTION_LABELS: Record<string, string> = {
  follow_up: 'Follow-up',
  waiting_on_them: 'Waiting on them',
  invoice: 'Invoice',
  renewal: 'Renewal',
  prospect: 'Prospect',
}

export const ACTION_COLOURS: Record<string, string> = {
  follow_up: 'bg-brand-navy/[0.07] border-brand-navy/25 text-brand-navy',
  waiting_on_them: 'bg-amber-50 border-amber-300 text-amber-800',
  invoice: 'bg-orange-50 border-orange-300 text-orange-800',
  renewal: 'bg-brand-olive/10 border-brand-olive/40 text-[#5a7244]',
  prospect: 'bg-emerald-50 border-emerald-300 text-emerald-800',
}

export const BADGE_CLASSES: Record<Badge, string> = {
  REPLY:        'bg-amber-50 border border-amber-400 text-amber-900',
  OVERDUE:      'bg-red-50 border border-red-400 text-red-800',
  DUE_TODAY:    'bg-red-50 border border-red-400 text-red-800',
  DUE_TOMORROW: 'bg-amber-50 border border-amber-400 text-amber-800',
  DUE_SOON:     'bg-amber-50 border border-amber-300 text-amber-800',
  FLAG:         'bg-brand-olive/10 border border-brand-olive/40 text-[#5a7244]',
  RENEWAL:      'bg-brand-olive/10 border border-brand-olive/40 text-[#5a7244]',
  QUIET:        'bg-slate-50 border border-slate-300 text-slate-700',
  REMINDER:     'bg-gray-50 border border-gray-300 text-gray-600',
}

export function getBadgeClass(item: UnifiedItem): string {
  if (item.badge === 'REPLY') {
    const days = (item as CorrespondenceItem).daysAgo ?? 0
    return days >= 7
      ? 'bg-red-50 border border-red-400 text-red-800'
      : 'bg-amber-50 border border-amber-400 text-amber-900'
  }
  return BADGE_CLASSES[item.badge]
}

export const LEFT_BORDER: Record<Badge, string> = {
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

export function daysAgoFn(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function daysUntilFn(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function makeSnippet(text: string | null | undefined): string | null {
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
export function likelyNeedsReply(item: CorrespondenceItem): boolean {
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

export { formatDateGB }

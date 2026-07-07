import type { NewsLeadStatus, ProspectLeadStatus, ProspectMatchType } from '@/app/actions/leads'

export const NEWS_COLUMNS: { value: NewsLeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'writing', label: 'Writing' },
  { value: 'published', label: 'Published' },
  { value: 'killed', label: 'Killed' },
]

export const PROSPECT_COLUMNS: { value: ProspectLeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'outreach_planned', label: 'Outreach Planned' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'rejected', label: 'Rejected' },
]

export const MATCH_TYPE_META: Record<ProspectMatchType, { label: string; badge: string }> = {
  new_business: { label: 'New business', badge: 'bg-green-100 text-green-800' },
  existing_no_deal: { label: 'Existing, no deal', badge: 'bg-amber-100 text-amber-800' },
  existing_expired: { label: 'Existing, expired', badge: 'bg-orange-100 text-orange-800' },
  existing_dormant: { label: 'Existing, dormant', badge: 'bg-yellow-100 text-yellow-800' },
}

export const STORY_TYPE_BADGE: Record<string, string> = {
  planning: 'bg-indigo-50 text-indigo-700',
  crime: 'bg-red-50 text-red-700',
  transport: 'bg-sky-50 text-sky-700',
  event: 'bg-purple-50 text-purple-700',
  business: 'bg-green-50 text-green-700',
  community: 'bg-pink-50 text-pink-700',
  council: 'bg-slate-100 text-slate-700',
  other: 'bg-gray-100 text-gray-600',
}

// Deterministic colour per source name so badges stay stable between renders
const SOURCE_PALETTE = [
  'bg-blue-50 text-blue-700',
  'bg-emerald-50 text-emerald-700',
  'bg-violet-50 text-violet-700',
  'bg-rose-50 text-rose-700',
  'bg-cyan-50 text-cyan-700',
  'bg-orange-50 text-orange-700',
  'bg-lime-50 text-lime-700',
  'bg-fuchsia-50 text-fuchsia-700',
]

export function sourceBadgeClass(sourceName: string): string {
  let hash = 0
  for (let i = 0; i < sourceName.length; i++) {
    hash = (hash * 31 + sourceName.charCodeAt(i)) | 0
  }
  return SOURCE_PALETTE[Math.abs(hash) % SOURCE_PALETTE.length]
}

export function storyTypeBadgeClass(storyType: string | null): string {
  if (!storyType) return STORY_TYPE_BADGE.other
  return STORY_TYPE_BADGE[storyType] ?? STORY_TYPE_BADGE.other
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

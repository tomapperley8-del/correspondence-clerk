// Stage 18: emails Tom's team forwarded in that sit on the team member's record instead of
// the business that first wrote. One reading for the one-off data script
// (scripts/stage18-team-forwards.ts) and the review page (/review/team-forwards). The team is
// the inbound route's rule (getTeamEmails): contacts on Internal businesses, less notification
// services. Read-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { looksForwarded, originalSenderOfForward, newBusinessRefusal, isPersonalDomain, registrableDomain, domainBusinessNameScore } from '@/lib/inbound/utils'

/** Dawn's (Dwmultimedia) ad emails are Stage 17b's. */
const LEAVE_TO_17B = new Set(['Dwmultimedia'])
const OWN_DOMAINS = ['thechiswickcalendar.co.uk', 'chiswickcalendar.co.uk']

export type TeamForwardMove = {
  id: string; team_business_id: string; team_name: string; to_business_id: string; to_name: string
  contact_id: string; sender: string; subject: string | null; date: string; direction: string | null
  reply_dismissed_at: string | null
}
export type TeamForwardReview = {
  id: string; team_business_id: string; team_name: string; subject: string | null; date: string
  sender: string; why: string; candidates: { id: string; name: string }[]
}

type Contact = { id: string; business_id: string; emails: unknown }
type Entry = {
  id: string; business_id: string; subject: string | null; direction: string | null; entry_date: string
  raw_text_original: string | null; reply_dismissed_at: string | null; ai_metadata: Record<string, unknown> | null
}

async function all<T>(build: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let a = 0; ; a += 1000) {
    const { data, error } = await build(a, a + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return out
  }
}

const emailsOf = (c: Contact) =>
  (Array.isArray(c.emails) ? c.emails : []).filter((e): e is string => typeof e === 'string').map((e) => e.trim().toLowerCase())

/**
 * `hold`: entry ids that must not be moved automatically (they go to review).
 * Entries Tom chose to keep with the team member (ai_metadata.team_forward_kept) are left out.
 */
export async function findTeamForwards(supabase: SupabaseClient, orgId: string, hold: Set<string> = new Set()) {
  const businesses = await all<{ id: string; name: string; business_type: string | null; merged_into: string | null; status: string | null }>((a, b) =>
    supabase.from('businesses').select('id, name, business_type, merged_into, status').eq('organization_id', orgId).order('id').range(a, b))
  const byId = new Map(businesses.map((b) => [b.id, b]))
  const internal = businesses.filter((b) => b.business_type === 'internal' && !b.merged_into)
  const internalIds = new Set(internal.map((b) => b.id))
  const contacts = await all<Contact>((a, b) => supabase.from('contacts').select('id, business_id, emails').order('id').range(a, b))

  const team = new Set<string>()
  for (const c of contacts) if (internalIds.has(c.business_id)) for (const e of emailsOf(c)) {
    const d = e.split('@')[1] ?? ''
    if (newBusinessRefusal(d) === 'notification service' || /(?:^|\.)(?:intuit|quickbooks|mailchimp)\.com$/.test(d)) continue
    team.add(e)
  }
  const { data: profiles } = await supabase.from('user_profiles').select('own_email_addresses').eq('organization_id', orgId)
  const own = new Set<string>((profiles ?? []).flatMap((p) => (p.own_email_addresses ?? []) as string[]).map((e) => e.toLowerCase()))
  const isUs = (e: string) => own.has(e) || team.has(e) || OWN_DOMAINS.includes(e.split('@')[1] ?? '')

  const teamBiz = internal.filter((b) =>
    !LEAVE_TO_17B.has(b.name) && contacts.some((c) => c.business_id === b.id && emailsOf(c).some((e) => team.has(e))))

  // Where each address is a contact, outside the team's records and hidden ones
  const where = new Map<string, Set<string>>()
  const contactAt = new Map<string, string>()
  for (const c of contacts) {
    const b = byId.get(c.business_id)
    if (!b || b.merged_into || internalIds.has(b.id) || b.status === 'Not a business') continue
    for (const e of emailsOf(c)) {
      if (!where.has(e)) where.set(e, new Set())
      where.get(e)!.add(b.id)
      contactAt.set(`${b.id}|${e}`, c.id)
    }
  }

  // A match is trusted when the sender writes from a personal address, or their company domain
  // fits the business's name. Learned domain mappings are not enough: some were learned wrongly
  // (Chamber Orchestra's address sat on B&Q's contact and its domain mapped there).
  const letters = (x: string) => x.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z]/g, '')
  const fits = (email: string, businessId: string) => {
    const domain = email.split('@')[1] ?? ''
    if (isPersonalDomain(domain)) return true
    const name = byId.get(businessId)?.name ?? ''
    // Letters only, in order: operahollandpark.com fits "Opera Holland Park"
    const base = letters(registrableDomain(domain).split('.')[0] ?? '')
    const plain = letters(name)
    if (base.length >= 3 && plain.length >= 3 && (plain.includes(base) || base.includes(plain))) return true
    return domainBusinessNameScore(domain, name) >= 0.9
  }

  const moves: TeamForwardMove[] = []
  const review: TeamForwardReview[] = []
  let stay = 0
  for (const tb of teamBiz) {
    const entries = await all<Entry>((a, b) => supabase.from('correspondence')
      .select('id, business_id, subject, direction, entry_date, raw_text_original, reply_dismissed_at, ai_metadata')
      .eq('business_id', tb.id).order('id').range(a, b))
    for (const e of entries) {
      const raw = e.raw_text_original ?? ''
      if (e.ai_metadata?.team_forward_kept || !looksForwarded(e.subject ?? '', raw)) { stay++; continue }
      const s = originalSenderOfForward(raw, isUs)
      if (!s) { stay++; continue }
      const at = [...(where.get(s.email) ?? [])]
      const base = { id: e.id, team_business_id: tb.id, team_name: tb.name, subject: e.subject, date: e.entry_date.slice(0, 10), sender: s.email }
      const candidates = at.map((id) => ({ id, name: byId.get(id)?.name ?? '' }))
      if (hold.has(e.id)) {
        review.push({ ...base, why: 'the contact on file looks wrong', candidates })
      } else if (at.length === 1 && !fits(s.email, at[0])) {
        review.push({ ...base, why: `the contact on file may be wrong: ${s.email.split('@')[1]} doesn't fit ${candidates[0].name}`, candidates })
      } else if (at.length === 1) {
        moves.push({ ...base, to_business_id: at[0], to_name: candidates[0].name, contact_id: contactAt.get(`${at[0]}|${s.email}`)!,
          direction: e.direction, reply_dismissed_at: e.reply_dismissed_at })
      } else {
        review.push({ ...base, candidates, why: at.length > 1 ? `${s.email} is a contact at ${at.length} businesses` : `no business has ${s.email} as a contact` })
      }
    }
  }
  return { team: [...team].sort(), teamRecords: teamBiz.map((b) => b.name), moves, review, stay }
}

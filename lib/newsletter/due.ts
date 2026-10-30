// Due a mention (Stage 16a, shared since Stage 18): Club Card members and advertisers with a
// deal in force, never in the newsletter since joining first (earliest joined first), then
// longest since last in. Not a fixed gap. The Newsletter tab and the morning desk email both
// order the list with mentionQueue, so they agree.

import type { SupabaseClient } from '@supabase/supabase-js'

export type MentionInput = {
  business_id: string
  name: string
  deal_types_in_force: string[]
  /** Start of the deal shown for the business (the in-force deal ending last). */
  joined: string | null
  /** Last confirmed newsletter mention (v_business_newsletter). */
  last_in: string | null
}

export type MentionRow = {
  business_id: string; name: string; deal: 'club_card' | 'advertiser'; joined: string | null
  last_in: string | null; days: number | null
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

export function mentionQueue(rows: MentionInput[], today: string): MentionRow[] {
  const queue: MentionRow[] = []
  for (const r of rows) {
    const types = r.deal_types_in_force
    if (!types.includes('club_card') && !types.includes('advertiser')) continue
    const sinceJoin = r.last_in && r.joined && r.last_in < r.joined ? null : r.last_in
    queue.push({
      business_id: r.business_id, name: r.name, deal: types.includes('advertiser') ? 'advertiser' : 'club_card', joined: r.joined,
      last_in: sinceJoin, days: sinceJoin ? daysBetween(sinceJoin, today) : null,
    })
  }
  return queue.sort((a, b) => (a.last_in === null) !== (b.last_in === null) ? (a.last_in === null ? -1 : 1)
    : a.last_in === null ? (a.joined ?? '').localeCompare(b.joined ?? '') : a.last_in.localeCompare(b.last_in!))
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

/**
 * The queue's inputs read straight from the tables the Businesses table uses (v_businesses,
 * contracts, v_business_newsletter), for callers without a signed-in user (the desk email).
 */
export async function loadMentionQueue(supabase: SupabaseClient, orgId: string, today: string): Promise<MentionRow[]> {
  const [biz, contracts, nl] = await Promise.all([
    all<{ id: string; name: string; status: string | null }>((a, b) => supabase.from('v_businesses').select('id, name, status')
      .eq('organization_id', orgId).is('merged_into', null).order('id').range(a, b)),
    all<{ business_id: string; membership_type: string | null; contract_start: string | null; contract_end: string | null; is_current: boolean | null }>((a, b) =>
      supabase.from('contracts').select('business_id, membership_type, contract_start, contract_end, is_current')
        .eq('organization_id', orgId).eq('is_current', true).order('id').range(a, b)),
    all<{ business_id: string; last_in_newsletter: string }>((a, b) =>
      supabase.from('v_business_newsletter').select('business_id, last_in_newsletter').order('business_id').range(a, b)),
  ])
  const inForce = new Map<string, typeof contracts>()
  for (const c of contracts) {
    if ((c.contract_start && c.contract_start > today) || (c.contract_end && c.contract_end < today)) continue
    inForce.set(c.business_id, [...(inForce.get(c.business_id) ?? []), c])
  }
  const lastIn = new Map(nl.map((n) => [n.business_id, n.last_in_newsletter]))
  const rows: MentionInput[] = []
  for (const b of biz) {
    if (b.status === 'Not a business') continue
    const deals = inForce.get(b.id) ?? []
    const types = [...new Set(deals.map((c) => c.membership_type).filter((t): t is string => !!t))]
    // The deal the Businesses table shows: an active type first, then the one ending last (open-ended first)
    const shown = [...deals].sort((x, y) =>
      Number(['club_card', 'advertiser'].includes(y.membership_type ?? '')) - Number(['club_card', 'advertiser'].includes(x.membership_type ?? ''))
      || (y.contract_end ?? '9999').localeCompare(x.contract_end ?? '9999'))[0]
    rows.push({ business_id: b.id, name: b.name, deal_types_in_force: types, joined: shown?.contract_start ?? null, last_in: lastIn.get(b.id) ?? null })
  }
  return mentionQueue(rows, today)
}

// Nightly read of What's On listings (Stage 20). Works out each listing request from the
// emails in correspondence (lib/listings/parse.ts), then checks the website's events calendar
// for whether it is live (lib/listings/website.ts), and updates listing_requests.
// Never overwrites Tom's own choices: a match he confirmed, events he said were not it, a
// request he hid, or the business he moved it to.

import type { SupabaseClient } from '@supabase/supabase-js'
import { eventLinks, parseRequests, type EntryRow, type ParsedRequest } from './parse'
import { clearDayCache, eventByLink, findByTitle } from './website'

const RECHECK_DAYS = 30
const CURRENT_DAYS = 60
const MAX_SEARCHES = 40

type Existing = {
  id: string
  request_key: string
  website_state: string
  match_kind: string | null
  website_url: string | null
  website_event_id: number | null
  event_starts_at: string | null
  checked_at: string | null
  website_gone_at: string | null
  hidden_at: string | null
  rejected_event_ids: number[] | null
  business_set_by_hand: boolean
}

export type ListingSyncResult = {
  ok: boolean
  requests_seen?: number
  requests_new?: number
  went_live?: number
  possible?: number
  searched?: number
  problems?: string[]
  error?: string
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++])
  }))
}

async function loadEntries(supabase: SupabaseClient, orgId: string): Promise<EntryRow[]> {
  const out: EntryRow[] = []
  for (let from = 0; from < 5000; from += 200) {
    const { data, error } = await supabase.from('correspondence')
      .select('id, entry_date, direction, business_id, raw_text_original')
      .eq('organization_id', orgId)
      .or('raw_text_original.ilike.%Event Title:%,raw_text_original.ilike.%cleopatracw4%')
      .order('entry_date').range(from, from + 199)
    if (error) throw new Error(`reading correspondence: ${error.message}`)
    out.push(...((data ?? []) as EntryRow[]))
    if (!data || data.length < 200) break
  }
  return out
}

/** The requester's business: by their email on a contact, else where the emails were filed (never an internal record). */
async function businessFor(
  supabase: SupabaseClient, orgId: string, reqs: ParsedRequest[],
): Promise<Map<string, string | null>> {
  const { data: biz } = await supabase.from('businesses').select('id, business_type, merged_into, status').eq('organization_id', orgId)
  const byId = new Map((biz ?? []).map((b) => [b.id as string, b]))
  const survivor = (id: string | null | undefined): string | null => {
    let cur = id ? byId.get(id) : undefined
    for (let n = 0; cur?.merged_into && n < 5; n++) cur = byId.get(cur.merged_into)
    if (!cur || cur.business_type === 'internal' || cur.status === 'Not a business') return null
    return cur.id
  }
  const emails = [...new Set(reqs.map((r) => r.requester_email).filter(Boolean))] as string[]
  const byEmail = new Map<string, string>()
  for (let i = 0; i < emails.length; i += 25) {
    const part = emails.slice(i, i + 25)
    const { data } = await supabase.from('contacts').select('business_id, emails')
      .eq('organization_id', orgId)
      .or(part.map((e) => `emails.cs.${JSON.stringify([e])}`).join(','))
    for (const c of data ?? []) {
      for (const e of (c.emails ?? []) as string[]) {
        const sv = survivor(c.business_id)
        if (sv && part.includes(e.toLowerCase()) && !byEmail.has(e.toLowerCase())) byEmail.set(e.toLowerCase(), sv)
      }
    }
  }
  const out = new Map<string, string | null>()
  for (const r of reqs) {
    const fromEmail = r.requester_email ? byEmail.get(r.requester_email) : undefined
    const filed = r.entry_business_ids.map(survivor).find(Boolean) ?? null
    out.set(r.request_key, fromEmail ?? filed)
  }
  return out
}

export async function syncListings(supabase: SupabaseClient, orgId: string): Promise<ListingSyncResult> {
  const problems: string[] = []
  clearDayCache()
  const entries = await loadEntries(supabase, orgId)
  const reqs = parseRequests(entries)
  const business = await businessFor(supabase, orgId, reqs)

  const { data: existingRows, error: exErr } = await supabase.from('listing_requests')
    .select('id, request_key, website_state, match_kind, website_url, website_event_id, event_starts_at, checked_at, website_gone_at, hidden_at, rejected_event_ids, business_set_by_hand')
    .eq('organization_id', orgId)
  if (exErr) throw new Error(`reading listing_requests: ${exErr.message}`)
  const existing = new Map((existingRows as Existing[] ?? []).map((r) => [r.request_key, r]))

  const now = Date.now()
  const rows = reqs.map((r) => {
    const ex = existing.get(r.request_key)
    const row: Record<string, unknown> = {
      organization_id: orgId,
      request_key: r.request_key,
      source: r.source,
      title: r.title,
      requester_name: r.requester_name,
      requester_email: r.requester_email,
      event_when: r.event_when,
      entry_ids: r.entry_ids,
      asked_at: r.asked_at,
      sent_to_cleo_at: r.sent_to_cleo_at,
      cleo_replied_at: r.cleo_replied_at,
      cleo_note: r.cleo_note,
      told_at: r.told_at,
      event_links: r.event_links,
      updated_at: new Date().toISOString(),
    }
    if (!ex?.business_set_by_hand) row.business_id = business.get(r.request_key) ?? null
    return { r, ex, row }
  })

  // Website checks. Links first (they are certain), then title searches for the newest open requests.
  type Job = (typeof rows)[number]
  const linkJobs: Job[] = []
  const searchJobs: Job[] = []
  for (const j of rows) {
    const kind = j.ex?.match_kind
    if (kind === 'confirmed' || kind === 'manual') continue
    const fresh = j.ex?.checked_at && now - new Date(j.ex.checked_at).getTime() < RECHECK_DAYS * 86400000
    if (j.r.event_links.length > 0) {
      const sameLink = j.ex?.website_state === 'live' && j.ex.match_kind === 'link' && j.r.event_links.includes(j.ex.website_url ?? '')
      // A page the website has already removed won't come back; don't ask again.
      if (!(sameLink && (fresh || j.ex?.website_gone_at))) linkJobs.push(j)
      continue
    }
    if (j.ex?.website_state === 'live' && fresh) continue
    const asked = new Date(j.r.asked_at ?? 0).getTime()
    const eventAhead = j.ex?.event_starts_at && new Date(j.ex.event_starts_at).getTime() > now
    if (now - asked < CURRENT_DAYS * 86400000 || eventAhead) searchJobs.push(j)
  }
  searchJobs.sort((a, b) => (b.r.asked_at ?? '').localeCompare(a.r.asked_at ?? ''))
  const searches = searchJobs.slice(0, MAX_SEARCHES)

  let wentLive = 0
  let possible = 0
  let failures = 0
  const checkedAt = new Date().toISOString()
  const setEvent = (j: Job, state: string, kind: string | null, ev: { id: number; url: string; title: string; published_at: string | null; starts_at: string | null } | null) => {
    if (state === 'live' && j.ex?.website_state !== 'live') wentLive++
    if (state === 'possible') possible++
    Object.assign(j.row, {
      website_state: state, match_kind: kind,
      website_event_id: ev?.id ?? null, website_url: ev?.url ?? null, website_title: ev?.title ?? null,
      website_published_at: ev?.published_at ?? null, event_starts_at: ev?.starts_at ?? null, checked_at: checkedAt,
      website_gone_at: null,
    })
  }

  await pool(linkJobs, 4, async (j) => {
    try {
      for (const url of j.r.event_links) {
        const link = eventLinks(url)[0]
        if (!link) continue
        const ev = await eventByLink(link)
        if (ev) return setEvent(j, 'live', 'link', ev)
      }
      // Cleo (or Tom) sent the link, so it was listed. The website deletes events about a month
      // after they happen; keep what was known and note when the page went.
      if (j.ex?.website_state !== 'live') wentLive++
      const first = eventLinks(j.r.event_links[0])[0]
      Object.assign(j.row, {
        website_state: 'live', match_kind: 'link', website_url: j.ex?.website_url ?? j.r.event_links[0],
        website_gone_at: j.ex?.website_gone_at ?? checkedAt, checked_at: checkedAt,
        ...(first?.date && !j.ex?.event_starts_at ? { event_starts_at: `${first.date}T12:00:00Z` } : {}),
      })
    } catch (e) {
      failures++
      problems.push(`${j.r.title}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  await pool(searches, 4, async (j) => {
    try {
      const m = await findByTitle(j.r.title, j.r.asked_at ?? checkedAt, j.ex?.rejected_event_ids ?? [])
      if (!m) return setEvent(j, 'none', null, null)
      setEvent(j, m.sure ? 'live' : 'possible', m.sure ? 'title' : null, m.event)
    } catch (e) {
      failures++
      problems.push(`${j.r.title}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  const attempted = linkJobs.length + searches.length
  if (attempted > 0 && failures === attempted) {
    return { ok: false, error: `could not read the website's events calendar (${problems[0] ?? 'no answer'})`, problems: problems.slice(0, 20) }
  }

  // Rows that skipped a check carry fewer columns. A batch upsert sets every column any row in it
  // names, so save each shape separately and the untouched columns keep their values.
  const shapes = new Map<string, Record<string, unknown>[]>()
  for (const j of rows) {
    const shape = Object.keys(j.row).sort().join(',')
    shapes.set(shape, [...(shapes.get(shape) ?? []), j.row])
  }
  for (const group of shapes.values()) {
    for (let i = 0; i < group.length; i += 100) {
      const { error } = await supabase.from('listing_requests')
        .upsert(group.slice(i, i + 100), { onConflict: 'organization_id,request_key' })
      if (error) throw new Error(`saving listing_requests: ${error.message}`)
    }
  }

  // A request the emails no longer give (two forms now read as one, a title read better) goes,
  // unless Tom has done something with it.
  const seen = new Set(rows.map((j) => j.r.request_key))
  const stale = (existingRows as (Existing & { id: string })[] ?? [])
    .filter((x) => !seen.has(x.request_key) && !x.business_set_by_hand && x.match_kind !== 'confirmed' && x.match_kind !== 'manual'
      && !(x.rejected_event_ids ?? []).length && !x.hidden_at)
    .map((x) => x.id)
  if (stale.length) await supabase.from('listing_requests').delete().in('id', stale)

  return {
    ok: true,
    requests_seen: rows.length,
    requests_new: rows.filter((j) => !j.ex).length,
    went_live: wentLive,
    possible,
    searched: searches.length,
    problems: problems.slice(0, 20),
  }
}

/** Runs the read for an org and records the run in listing_sync_runs (watched by system_alarm()). */
export async function syncAndRecord(supabase: SupabaseClient, orgId: string): Promise<ListingSyncResult> {
  let result: ListingSyncResult
  try {
    result = await syncListings(supabase, orgId)
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  await supabase.from('listing_sync_runs').insert({
    organization_id: orgId,
    ok: result.ok,
    requests_seen: result.requests_seen ?? null,
    requests_new: result.requests_new ?? null,
    went_live: result.went_live ?? null,
    possible: result.possible ?? null,
    searched: result.searched ?? null,
    problems: result.problems ?? [],
    error: result.error ?? null,
  })
  return result
}

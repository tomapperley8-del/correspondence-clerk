import { fetchArchivedIssue, listArchive, NEWSLETTER_SUBJECT, NewsletterIssueIn } from './archive'
import { FoundMention, matchIssues, MatchBusiness, MatchCardPage, MatchRules } from './match'

/**
 * Reads new newsletter issues from Mailchimp's public archive into newsletter_issues and re-finds
 * mentions (Stage 16a). Used by /api/cron/newsletter-issues (weekly, Wednesday); the first run
 * stores the 20 issues the archive lists. Public pages only; nothing is sent anywhere.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any

export interface ReadResult {
  ok: boolean
  issues_seen?: number
  issues_new?: number
  mentions_new?: number
  error?: string
}

async function pagedSelect<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

/** Finds who each stored issue mentions. Keeps Tom's decisions; drops undecided mentions no longer found. */
export async function rematchOrg(supabase: ServiceClient, orgId: string): Promise<{ mentions_new: number; found: FoundMention[] }> {
  const issues = await pagedSelect<{ id: string; plain_text: string }>((a, b) =>
    supabase.from('newsletter_issues').select('id, plain_text').eq('organization_id', orgId).order('sent_at').range(a, b))
  const businesses = await pagedSelect<{ id: string; name: string; status: string | null; business_type: string | null; website: string | null; merged_into: string | null }>((a, b) =>
    supabase.from('businesses').select('id, name, status, business_type, website, merged_into').eq('organization_id', orgId).order('id').range(a, b))
  const pages = await pagedSelect<{ business_id: string; link: string; page_website_host: string | null }>((a, b) =>
    supabase.from('club_card_pages').select('business_id, link, page_website_host').eq('organization_id', orgId).not('business_id', 'is', null).is('gone_at', null).order('id').range(a, b))
  const ruleRows = await pagedSelect<{ kind: string; business_id: string | null; phrase: string | null }>((a, b) =>
    supabase.from('newsletter_match_rules').select('kind, business_id, phrase').eq('organization_id', orgId).order('id').range(a, b))
  const rules: MatchRules = {
    always: new Set(ruleRows.filter((r) => r.kind === 'always' && r.business_id).map((r) => r.business_id!)),
    never: new Set(ruleRows.filter((r) => r.kind === 'never' && r.business_id).map((r) => r.business_id!)),
    aliases: ruleRows.filter((r) => r.kind === 'alias' && r.business_id && r.phrase).map((r) => ({ businessId: r.business_id!, phrase: r.phrase! })),
    ignorePhrases: ruleRows.filter((r) => r.kind === 'ignore_phrase' && r.phrase).map((r) => r.phrase!),
  }

  const found = matchIssues(
    issues.map((i) => ({ id: i.id, text: i.plain_text })),
    businesses.filter((b) => !b.merged_into).map<MatchBusiness>((b) => ({ id: b.id, name: b.name, status: b.status, businessType: b.business_type, website: b.website })),
    pages.map<MatchCardPage>((p) => ({ businessId: p.business_id, link: p.link, websiteHost: p.page_website_host })),
    rules
  )

  const existing = await pagedSelect<{ id: string; issue_id: string; business_id: string; match_kind: string; status: string; matched_text: string; unclear_reason: string | null; decided_at: string | null }>((a, b) =>
    supabase.from('newsletter_mentions').select('id, issue_id, business_id, match_kind, status, matched_text, unclear_reason, decided_at').eq('organization_id', orgId).order('id').range(a, b))
  const key = (i: string, b: string) => `${i}|${b}`
  const have = new Map(existing.map((e) => [key(e.issue_id, e.business_id), e]))
  const foundKeys = new Set(found.map((f) => key(f.issueId, f.businessId)))

  const now = new Date().toISOString()
  const toWrite = found
    .filter((f) => {
      const e = have.get(key(f.issueId, f.businessId))
      if (!e) return true
      if (e.decided_at) return false // Tom's decision stands
      return e.status !== f.status || e.match_kind !== f.kind || e.matched_text !== f.matchedText || e.unclear_reason !== f.unclearReason
    })
    .map((f) => ({
      organization_id: orgId, issue_id: f.issueId, business_id: f.businessId, match_kind: f.kind,
      matched_text: f.matchedText, context: f.context, status: f.status, unclear_reason: f.unclearReason, updated_at: now,
    }))
  const mentionsNew = found.filter((f) => !have.has(key(f.issueId, f.businessId))).length
  for (let i = 0; i < toWrite.length; i += 500) {
    const { error } = await supabase.from('newsletter_mentions').upsert(toWrite.slice(i, i + 500), { onConflict: 'issue_id,business_id' })
    if (error) throw new Error(`saving mentions: ${error.message}`)
  }
  const gone = existing.filter((e) => !e.decided_at && !foundKeys.has(key(e.issue_id, e.business_id))).map((e) => e.id)
  for (let i = 0; i < gone.length; i += 200) {
    const { error } = await supabase.from('newsletter_mentions').delete().in('id', gone.slice(i, i + 200))
    if (error) throw new Error(`removing old mentions: ${error.message}`)
  }
  await supabase.from('newsletter_issues').update({ matched_at: now }).eq('organization_id', orgId)
  return { mentions_new: mentionsNew, found }
}

export async function readNewsletterForOrg(
  supabase: ServiceClient,
  orgId: string,
  opts: { trigger?: string } = {}
): Promise<ReadResult> {
  let result: ReadResult
  try {
    const listed = (await listArchive()).filter((l) => l.title.startsWith(NEWSLETTER_SUBJECT))
    const stored = await pagedSelect<{ source_id: string; sent_at: string }>((a, b) =>
      supabase.from('newsletter_issues').select('source_id, sent_at').eq('organization_id', orgId).order('id').range(a, b))
    // The listing has no campaign id, so a listed issue is new unless one from that day is stored
    const haveDays = new Set(stored.map((s) => new Date(s.sent_at).toISOString().slice(0, 10)))
    const todo = listed.filter((l) => !haveDays.has(l.sentOn))

    const fetched: NewsletterIssueIn[] = []
    for (const l of todo) fetched.push(await fetchArchivedIssue(l))
    const have = new Set(stored.map((s) => s.source_id))
    const fresh = fetched.filter((f) => !have.has(f.sourceId))
    if (fresh.length) {
      const { error } = await supabase.from('newsletter_issues').upsert(
        fresh.map((f) => ({
          organization_id: orgId, source: 'mailchimp_archive', source_id: f.sourceId, sent_at: f.sentAt,
          subject: f.subject, plain_text: f.plainText, browser_url: f.browserUrl,
        })),
        { onConflict: 'organization_id,source_id', ignoreDuplicates: true }
      )
      if (error) throw new Error(`saving issues: ${error.message}`)
    }

    // Re-match when there is something new, or nothing has been matched yet
    let mentionsNew = 0
    const { count: unmatched } = await supabase.from('newsletter_issues').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).is('matched_at', null)
    if (fresh.length || (unmatched ?? 0) > 0) mentionsNew = (await rematchOrg(supabase, orgId)).mentions_new

    result = { ok: true, issues_seen: listed.length, issues_new: fresh.length, mentions_new: mentionsNew }
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  await supabase.from('newsletter_read_runs').insert({
    organization_id: orgId, ok: result.ok, trigger: opts.trigger ?? 'cron',
    issues_seen: result.issues_seen ?? null, issues_new: result.issues_new ?? null,
    mentions_new: result.mentions_new ?? null, error: result.error ?? null,
  })
  return result
}

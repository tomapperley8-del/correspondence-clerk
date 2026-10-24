import { makeGmailTokenRefreshHandler } from '@/lib/email-import/token-helpers'
import { GmailReconnectNeeded, fetchNewsletterIssue, listNewsletterMessageIds, NewsletterIssueIn } from './gmail'
import { FoundMention, matchIssues, MatchBusiness, MatchCardPage } from './match'

/**
 * Reads new newsletter issues from Gmail into newsletter_issues and re-finds mentions (Stage 16a).
 * Used by /api/cron/newsletter-issues (weekly, Wednesday) and for the one-off back catalogue
 * (the same call, repeated until more_to_read is false). Nothing is sent; Gmail is read-only.
 * Refreshing the Gmail token writes the new access token to user_profiles (as the bulk import does).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any

export interface ReadResult {
  ok: boolean
  issues_seen?: number
  issues_new?: number
  mentions_new?: number
  more_to_read?: boolean
  reconnect_needed?: boolean
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
  const businesses = await pagedSelect<{ id: string; name: string; status: string | null; website: string | null; merged_into: string | null }>((a, b) =>
    supabase.from('businesses').select('id, name, status, website, merged_into').eq('organization_id', orgId).order('id').range(a, b))
  const pages = await pagedSelect<{ business_id: string; link: string; page_website_host: string | null }>((a, b) =>
    supabase.from('club_card_pages').select('business_id, link, page_website_host').eq('organization_id', orgId).not('business_id', 'is', null).is('gone_at', null).order('id').range(a, b))

  const found = matchIssues(
    issues.map((i) => ({ id: i.id, text: i.plain_text })),
    businesses.filter((b) => !b.merged_into).map<MatchBusiness>((b) => ({ id: b.id, name: b.name, status: b.status, website: b.website })),
    pages.map<MatchCardPage>((p) => ({ businessId: p.business_id, link: p.link, websiteHost: p.page_website_host }))
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
  opts: { maxNew?: number; trigger?: string } = {}
): Promise<ReadResult> {
  const maxNew = opts.maxNew ?? 60
  let result: ReadResult
  try {
    // The org's Gmail connection (the bulk import's): the member with a refresh token, most recently refreshed
    const { data: profiles, error: pErr } = await supabase
      .from('user_profiles')
      .select('id, google_access_token, google_refresh_token, google_token_expiry')
      .eq('organization_id', orgId)
      .not('google_refresh_token', 'is', null)
      .order('google_token_expiry', { ascending: false, nullsFirst: false })
      .limit(1)
    if (pErr) throw new Error(pErr.message)
    const profile = profiles?.[0]
    if (!profile) throw new GmailReconnectNeeded('no Gmail connection saved for this organisation')

    const tokens = {
      accessToken: profile.google_access_token ?? '',
      refreshToken: profile.google_refresh_token,
      tokenExpiry: profile.google_token_expiry,
    }
    const onRefresh = makeGmailTokenRefreshHandler(supabase, profile.id)

    const ids = await listNewsletterMessageIds(tokens, onRefresh)
    const stored = await pagedSelect<{ gmail_message_id: string }>((a, b) =>
      supabase.from('newsletter_issues').select('gmail_message_id').eq('organization_id', orgId).order('id').range(a, b))
    const have = new Set(stored.map((s) => s.gmail_message_id))
    const todo = ids.filter((id) => !have.has(id))
    const batch = todo.slice(0, maxNew)

    const fetched: NewsletterIssueIn[] = []
    for (let i = 0; i < batch.length; i += 10) {
      const got = await Promise.all(batch.slice(i, i + 10).map((id) => fetchNewsletterIssue(tokens, id, onRefresh)))
      fetched.push(...(got.filter(Boolean) as NewsletterIssueIn[]))
    }
    if (fetched.length) {
      const { error } = await supabase.from('newsletter_issues').upsert(
        fetched.map((f) => ({
          organization_id: orgId, gmail_message_id: f.gmailMessageId, sent_at: f.sentAt,
          subject: f.subject, plain_text: f.plainText, browser_url: f.browserUrl,
        })),
        { onConflict: 'organization_id,gmail_message_id', ignoreDuplicates: true }
      )
      if (error) throw new Error(`saving issues: ${error.message}`)
    }

    // Re-match when there is something new, or nothing has been matched yet
    let mentionsNew = 0
    const { count: unmatched } = await supabase.from('newsletter_issues').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).is('matched_at', null)
    if (fetched.length || (unmatched ?? 0) > 0) mentionsNew = (await rematchOrg(supabase, orgId)).mentions_new

    result = { ok: true, issues_seen: ids.length, issues_new: fetched.length, mentions_new: mentionsNew, more_to_read: todo.length > batch.length }
  } catch (e) {
    const reconnect = e instanceof GmailReconnectNeeded
    result = { ok: false, reconnect_needed: reconnect, error: e instanceof Error ? e.message : String(e) }
  }

  await supabase.from('newsletter_read_runs').insert({
    organization_id: orgId, ok: result.ok, trigger: opts.trigger ?? 'cron',
    issues_seen: result.issues_seen ?? null, issues_new: result.issues_new ?? null,
    mentions_new: result.mentions_new ?? null, more_to_read: result.more_to_read ?? false, error: result.error ?? null,
  })
  return result
}

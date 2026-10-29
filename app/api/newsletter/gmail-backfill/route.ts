import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { makeGmailTokenRefreshHandler } from '@/lib/email-import/token-helpers'
import { fetchGmailIssue, gmailClient, listGmailIssues } from '@/lib/newsletter/gmail'
import { rematchOrg } from '@/lib/newsletter/read'
import { refreshItems } from '@/lib/newsletter/items-store'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Stop taking new issues after this long, so one call finishes inside maxDuration. */
const BUDGET_MS = 200_000

/**
 * The newsletter's back catalogue from the signed-in user's Gmail (Stage 16a tab). Opened by
 * hand; each call stores as many missing issues as fit in its time, then re-finds mentions.
 * Open it again until `remaining` is 0. Read-only on Gmail; each call is a newsletter_read_runs row.
 */
export async function GET() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const supabase = createServiceRoleClient()
  const { data: tokens } = await supabase.from('user_profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry').eq('id', user.id).single()
  if (!tokens?.google_refresh_token) {
    return NextResponse.json({ error: 'Gmail is not connected. Connect it at /import/gmail, then open this again.' }, { status: 409 })
  }

  const started = Date.now()
  let result: { ok: boolean; listed?: number; added?: number; remaining?: number; via_email?: number; mentions_new?: number; error?: string }
  try {
    const gmail = gmailClient(tokens, makeGmailTokenRefreshHandler(supabase, user.id))
    const listed = await listGmailIssues(gmail)

    const stored: { source_id: string; sent_at: string }[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('newsletter_issues').select('source_id, sent_at')
        .eq('organization_id', orgId).order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      stored.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }
    // One issue a day: a day already stored (from the archive or an earlier call) is skipped
    const haveDays = new Set(stored.map((s) => new Date(s.sent_at).toISOString().slice(0, 10)))
    const haveIds = new Set(stored.map((s) => s.source_id))
    const todo = listed.filter((l) => !haveDays.has(l.sentOn))

    let added = 0
    let viaEmail = 0
    let done = 0
    for (const l of todo) {
      if (Date.now() - started > BUDGET_MS) break
      const issue = await fetchGmailIssue(gmail, l)
      done += 1
      haveDays.add(l.sentOn)
      if (haveIds.has(issue.sourceId)) continue
      const { error } = await supabase.from('newsletter_issues').upsert({
        organization_id: orgId, source: issue.via === 'archive' ? 'gmail_archive_link' : 'gmail',
        source_id: issue.sourceId, sent_at: issue.sentAt, subject: issue.subject,
        plain_text: issue.plainText, browser_url: issue.browserUrl,
      }, { onConflict: 'organization_id,source_id', ignoreDuplicates: true })
      if (error) throw new Error(`saving the ${l.sentOn} issue: ${error.message}`)
      haveIds.add(issue.sourceId)
      added += 1
      if (issue.via === 'email') viaEmail += 1
    }

    const mentionsNew = added ? (await rematchOrg(supabase, orgId)).mentions_new : 0
    if (added) await refreshItems(supabase, orgId)
    result = { ok: true, listed: listed.length, added, remaining: todo.length - done, via_email: viaEmail, mentions_new: mentionsNew }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    result = {
      ok: false,
      error: /invalid_grant|invalid_token|unauthorized_client/i.test(msg)
        ? 'Gmail access has lapsed. Reconnect it at /import/gmail, then open this again.'
        : msg,
    }
  }

  await supabase.from('newsletter_read_runs').insert({
    organization_id: orgId, ok: result.ok, trigger: 'gmail_backfill',
    issues_seen: result.listed ?? null, issues_new: result.added ?? null,
    mentions_new: result.mentions_new ?? null, error: result.error ?? null,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

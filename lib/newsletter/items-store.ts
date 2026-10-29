import { splitIssue, SplitItem } from './items'
import { KIND_ORDER, matchIssues } from './match'
import { loadMatchInputs, pagedSelect, ServiceClient } from './load'

/**
 * Splits stored issues into newsletter_items and finds each item's business and contributor
 * (Stage 16a, the Newsletter tab). Plain rules, no AI.
 *
 * Business: matchIssues() run with each item as its own "issue" (its text plus its link, so a banner
 * is matched by its website). An item takes a business only when the issue's mention of that business
 * is confirmed (by the rules or by Tom), so Yes and No on the tab carry through. Of several, the
 * strongest kind wins, then the one named first.
 * Contributor: a contributor's name or alias (a person, or a series such as "Volunteer stories") as
 * whole words, capitals ignored, the first one named.
 *
 * Rows are keyed on (issue_id, position) and only written when something changed. Where Tom edited an
 * item (edited_at), its kind, business and contributor stay as he left them.
 */

interface Contributor { id: string; name: string; aliases: string[] }
interface ItemRow {
  id: string; issue_id: string; position: number; section: string; kind: string; headline: string | null; blurb: string | null
  link_url: string | null; business_id: string | null; contributor_id: string | null; closes_on: string | null; edited_at: string | null
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function contributorMatchers(cs: Contributor[]) {
  return cs.flatMap((c) =>
    [c.name, ...(c.aliases ?? [])].map((s) => s.trim()).filter((s) => s.length >= 3)
      // Capitals ignored: series are often written in lower case ("Chiswick Calendar volunteer stories")
      .map((s) => ({ id: c.id, len: s.length, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(s)}(?![\\p{L}\\p{N}])`, 'iu') })))
}

function firstContributor(text: string, ms: ReturnType<typeof contributorMatchers>): string | null {
  let best: { id: string; at: number; len: number } | null = null
  for (const m of ms) {
    const hit = m.re.exec(text)
    if (hit && (!best || hit.index < best.at || (hit.index === best.at && m.len > best.len))) best = { id: m.id, at: hit.index, len: m.len }
  }
  return best?.id ?? null
}

export interface RefreshItemsResult { issues: number; items: number; written: number; removed: number }

/** issueIds: only these issues (after Yes or No on one issue's mentions); all of the org's otherwise. */
export async function refreshItems(supabase: ServiceClient, orgId: string, issueIds?: string[]): Promise<RefreshItemsResult> {
  const issues = issueIds
    ? ((await supabase.from('newsletter_issues').select('id, plain_text, sent_at').eq('organization_id', orgId).in('id', issueIds)).data ?? [])
    : await pagedSelect<{ id: string; plain_text: string; sent_at: string }>((a, b) =>
      supabase.from('newsletter_issues').select('id, plain_text, sent_at').eq('organization_id', orgId).order('sent_at').range(a, b))
  if (!issues.length) return { issues: 0, items: 0, written: 0, removed: 0 }
  const ids = new Set<string>(issues.map((i: { id: string }) => i.id))
  const inIssues = <T extends { issue_id: string }>(rows: T[]) => (issueIds ? rows.filter((r) => ids.has(r.issue_id)) : rows)

  const { businesses, pages, rules } = await loadMatchInputs(supabase, orgId)
  const contributors = await pagedSelect<Contributor>((a, b) =>
    supabase.from('newsletter_contributors').select('id, name, aliases').eq('organization_id', orgId).order('id').range(a, b))
  const mentions = inIssues(await pagedSelect<{ issue_id: string; business_id: string; status: string }>((a, b) =>
    supabase.from('newsletter_mentions').select('issue_id, business_id, status').eq('organization_id', orgId).order('id').range(a, b)))
  const existing = inIssues(await pagedSelect<ItemRow>((a, b) =>
    supabase.from('newsletter_items').select('id, issue_id, position, section, kind, headline, blurb, link_url, business_id, contributor_id, closes_on, edited_at')
      .eq('organization_id', orgId).order('id').range(a, b)))

  const confirmed = new Set(mentions.filter((m) => m.status === 'confirmed').map((m) => `${m.issue_id}|${m.business_id}`))
  const cMatch = contributorMatchers(contributors)

  // Split, then match every item at once (matchIssues builds its name patterns once per call)
  const split: { issueId: string; item: SplitItem; matchText: string }[] = []
  for (const i of issues as { id: string; plain_text: string; sent_at: string }[]) {
    const day = new Date(i.sent_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    for (const item of splitIssue(i.plain_text ?? '', day)) {
      split.push({ issueId: i.id, item, matchText: item.link_url && !item.text.includes(item.link_url) ? `${item.text} ${item.link_url}` : item.text })
    }
  }
  const key = (issueId: string, pos: number) => `${issueId}#${pos}`
  const found = matchIssues(split.map((s) => ({ id: key(s.issueId, s.item.position), text: s.matchText })), businesses, pages, rules)
  const bizFor = new Map<string, { id: string; rank: number; at: number }>()
  const textOf = new Map(split.map((s) => [key(s.issueId, s.item.position), s.matchText]))
  for (const f of found) {
    const issueId = f.issueId.slice(0, f.issueId.lastIndexOf('#'))
    if (!confirmed.has(`${issueId}|${f.businessId}`)) continue
    const at = Math.max(0, textOf.get(f.issueId)?.indexOf(f.matchedText) ?? 0)
    const cur = bizFor.get(f.issueId)
    const rank = KIND_ORDER[f.kind]
    if (!cur || rank < cur.rank || (rank === cur.rank && at < cur.at)) bizFor.set(f.issueId, { id: f.businessId, rank, at })
  }

  const have = new Map(existing.map((e) => [key(e.issue_id, e.position), e]))
  const now = new Date().toISOString()
  const rows = split.map(({ issueId, item }) => {
    const k = key(issueId, item.position)
    const e = have.get(k)
    const kept = e?.edited_at ? e : null
    return {
      organization_id: orgId, issue_id: issueId, position: item.position, section: item.section,
      kind: kept ? kept.kind : item.kind,
      headline: item.headline, blurb: item.blurb, link_url: item.link_url, closes_on: item.closes_on,
      business_id: kept ? kept.business_id : bizFor.get(k)?.id ?? null,
      contributor_id: kept ? kept.contributor_id : firstContributor(item.text, cMatch),
    }
  })
  const changed = rows.filter((r) => {
    const e = have.get(key(r.issue_id, r.position))
    return !e || e.section !== r.section || e.kind !== r.kind || e.headline !== r.headline || e.blurb !== r.blurb ||
      e.link_url !== r.link_url || e.closes_on !== r.closes_on || e.business_id !== r.business_id || e.contributor_id !== r.contributor_id
  }).map((r) => ({ ...r, updated_at: now }))
  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await supabase.from('newsletter_items').upsert(changed.slice(i, i + 500), { onConflict: 'issue_id,position' })
    if (error) throw new Error(`saving newsletter items: ${error.message}`)
  }

  // Positions the splitter no longer finds (its rules changed); Tom's edited items stay
  const live = new Set(rows.map((r) => key(r.issue_id, r.position)))
  const gone = existing.filter((e) => !e.edited_at && !live.has(key(e.issue_id, e.position))).map((e) => e.id)
  for (let i = 0; i < gone.length; i += 200) {
    const { error } = await supabase.from('newsletter_items').delete().in('id', gone.slice(i, i + 200))
    if (error) throw new Error(`removing old newsletter items: ${error.message}`)
  }
  return { issues: issues.length, items: rows.length, written: changed.length, removed: gone.length }
}

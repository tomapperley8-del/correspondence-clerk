'use server'

// The Newsletter tab (UI overhaul Stage 16a, layout B, Tom's pick on 29 Oct).
// Reads what the weekly read stored: issues, their items (lib/newsletter/items-store.ts),
// contributors, deal promises and the unclear mentions. Due-a-mention is a ranked queue of
// Club Card members and advertisers with a deal in force (never in since joining first, then
// longest since last in), not a fixed gap. The next issue list is Today's (getNewsletterList).
// Writes: Tom's edits to items, contributors and promises, banner ticks, Yes or No on a mention.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { getBusinessTable } from '@/app/actions/business-table'
import { refreshItems } from '@/lib/newsletter/items-store'
import { mentionQueue } from '@/lib/newsletter/due'
import type { ItemKind } from '@/lib/newsletter/items'
import { usualWeek, type UsualWeek } from '@/lib/newsletter/rhythm'

export type NlIssue = { id: string; date: string; url: string | null; items: number; businesses: number }
export type NlItem = {
  id: string; issue_id: string; date: string; position: number; section: string; kind: ItemKind
  headline: string | null; blurb: string | null; link_url: string | null; closes_on: string | null
  business_id: string | null; business_name: string | null; contributor_id: string | null; edited: boolean
}
export type NlContributor = {
  id: string; name: string; column_name: string | null; business_id: string | null; business_name: string | null
  aliases: string[]; expected_every_days: number | null; active: boolean; notes: string | null
  issues_total: number; issues_last_12_months: number; last_in: string | null; next_expected: string | null
  /** Which Wednesday of the month they usually appear, from their last 12 appearances */
  usual: UsualWeek | null
}
export type NlPromise = {
  id: string; contract_id: string; business_id: string; business_name: string; kind: 'blog' | 'editorial' | 'banner' | 'ad' | 'mention'
  quantity: number; per: 'term' | 'month' | 'week'; notes: string | null; contract_start: string | null; contract_end: string | null
  due_so_far: number; delivered: number; term_over: boolean; ticks: string[]
}
export type NlContract = { id: string; business_id: string; business_name: string; membership_type: string | null; contract_start: string | null; contract_end: string | null }
export type NlCheck = { id: string; issue_id: string; date: string; business_id: string; business_name: string; matched_text: string; context: string | null; reason: string | null }
export type NlQueueRow = { business_id: string; name: string; deal: 'club_card' | 'advertiser'; joined: string | null; last_in: string | null; days: number | null }

export type NewsletterTabData = {
  today: string
  issues: NlIssue[]
  items: NlItem[]
  contributors: NlContributor[]
  promises: NlPromise[]
  contracts: NlContract[]
  toCheck: NlCheck[]
  queue: NlQueueRow[]
  businesses: { id: string; name: string }[]
}

const londonDay = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

async function context() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' as const }
  return { supabase, orgId, userId: user.id }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) return out
  }
}

export async function getNewsletterTab(): Promise<{ data?: NewsletterTabData; error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  try {
    const [tableRes, issueRows, itemRows, contributorRows, promiseRows, tickRows, contractRows, checkRows] = await Promise.all([
      getBusinessTable(),
      all<{ id: string; sent_at: string; browser_url: string | null }>((a, b) =>
        supabase.from('newsletter_issues').select('id, sent_at, browser_url').eq('organization_id', orgId).order('sent_at', { ascending: false }).range(a, b)),
      all<{ id: string; issue_id: string; issue_date: string; position: number; section: string; kind: ItemKind; headline: string | null; blurb: string | null; link_url: string | null; closes_on: string | null; business_id: string | null; business_name: string | null; contributor_id: string | null; edited_by_hand: boolean }>((a, b) =>
        supabase.from('v_newsletter_items').select('id, issue_id, issue_date, position, section, kind, headline, blurb, link_url, closes_on, business_id, business_name, contributor_id, edited_by_hand')
          .eq('organization_id', orgId).order('issue_date', { ascending: false }).order('position').range(a, b)),
      all<Omit<NlContributor, 'aliases' | 'notes'>>((a, b) =>
        supabase.from('v_newsletter_contributors').select('id, name, column_name, business_id, business_name, expected_every_days, active, issues_total, issues_last_12_months, last_in, next_expected')
          .eq('organization_id', orgId).order('name').range(a, b)),
      all<Omit<NlPromise, 'ticks'>>((a, b) =>
        supabase.from('v_newsletter_promises').select('id, contract_id, business_id, business_name, kind, quantity, per, notes, contract_start, contract_end, due_so_far, delivered, term_over')
          .eq('organization_id', orgId).order('business_name').range(a, b)),
      all<{ promise_id: string; issue_id: string }>((a, b) =>
        supabase.from('newsletter_promise_ticks').select('promise_id, issue_id').eq('organization_id', orgId).order('promise_id').range(a, b)),
      all<{ id: string; business_id: string; membership_type: string | null; contract_start: string | null; contract_end: string | null; business: { name: string } | null }>((a, b) =>
        supabase.from('contracts').select('id, business_id, membership_type, contract_start, contract_end, business:businesses!contracts_business_id_fkey(name)')
          .eq('organization_id', orgId).eq('is_current', true).order('contract_start', { ascending: false }).range(a, b)),
      all<{ id: string; issue_id: string; business_id: string; matched_text: string; context: string | null; unclear_reason: string | null; business: { name: string } | null; issue: { sent_at: string } | null }>((a, b) =>
        supabase.from('newsletter_mentions').select('id, issue_id, business_id, matched_text, context, unclear_reason, business:businesses!newsletter_mentions_business_id_fkey(name), issue:newsletter_issues!newsletter_mentions_issue_id_fkey(sent_at)')
          .eq('organization_id', orgId).eq('status', 'unclear').order('id').range(a, b)),
    ])
    if (tableRes.error || !tableRes.data) return { error: tableRes.error ?? 'Could not load the businesses' }
    const today = tableRes.data.today

    // Aliases and notes are not in the view
    const extra = new Map((await all<{ id: string; aliases: string[]; notes: string | null }>((a, b) =>
      supabase.from('newsletter_contributors').select('id, aliases, notes').eq('organization_id', orgId).order('id').range(a, b))).map((c) => [c.id, c]))

    const perIssue = new Map<string, { items: number; biz: Set<string> }>()
    for (const it of itemRows) {
      const s = perIssue.get(it.issue_id) ?? { items: 0, biz: new Set<string>() }
      s.items += 1
      if (it.business_id) s.biz.add(it.business_id)
      perIssue.set(it.issue_id, s)
    }
    const datesBy = new Map<string, string[]>()
    for (const it of itemRows) if (it.contributor_id) datesBy.set(it.contributor_id, [...(datesBy.get(it.contributor_id) ?? []), it.issue_date])
    const ticks = new Map<string, string[]>()
    for (const t of tickRows) ticks.set(t.promise_id, [...(ticks.get(t.promise_id) ?? []), t.issue_id])

    // Due a mention: the shared rule (lib/newsletter/due.ts), also read by the desk email
    const queue: NlQueueRow[] = mentionQueue(tableRes.data.rows.map((r) => ({
      business_id: r.id, name: r.name, deal_types_in_force: r.deal_types_in_force ?? [],
      joined: r.deal?.contract_start ?? null, last_in: r.newsletter?.date ?? null,
    })), today)

    return {
      data: {
        today,
        issues: issueRows.map((i) => ({ id: i.id, date: londonDay(i.sent_at), url: i.browser_url, items: perIssue.get(i.id)?.items ?? 0, businesses: perIssue.get(i.id)?.biz.size ?? 0 })),
        items: itemRows.map((it) => ({
          id: it.id, issue_id: it.issue_id, date: it.issue_date, position: it.position, section: it.section, kind: it.kind,
          headline: it.headline, blurb: it.blurb ? it.blurb.slice(0, 220) : null, link_url: it.link_url, closes_on: it.closes_on,
          business_id: it.business_id, business_name: it.business_name, contributor_id: it.contributor_id, edited: it.edited_by_hand,
        })),
        contributors: contributorRows.map((c) => ({ ...c, aliases: extra.get(c.id)?.aliases ?? [], notes: extra.get(c.id)?.notes ?? null, usual: usualWeek(datesBy.get(c.id) ?? []) })),
        promises: promiseRows.map((p) => ({ ...p, ticks: ticks.get(p.id) ?? [] })),
        contracts: contractRows
          .filter((c) => !c.contract_end || c.contract_end >= today)
          .map((c) => ({ id: c.id, business_id: c.business_id, business_name: c.business?.name ?? '', membership_type: c.membership_type, contract_start: c.contract_start, contract_end: c.contract_end }))
          .sort((a, b) => a.business_name.localeCompare(b.business_name)),
        toCheck: checkRows
          .map((m) => ({ id: m.id, issue_id: m.issue_id, date: m.issue ? londonDay(m.issue.sent_at) : '', business_id: m.business_id, business_name: m.business?.name ?? '', matched_text: m.matched_text, context: m.context, reason: m.unclear_reason }))
          .sort((a, b) => b.date.localeCompare(a.date)),
        queue,
        businesses: tableRes.data.rows.filter((r) => r.status !== 'Not a business').map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Re-link items after a change the reader uses (a decided mention, a contributor's names). */
async function relink(orgId: string, issueIds?: string[]) {
  await refreshItems(createServiceRoleClient(), orgId, issueIds)
}

/** Tom's correction to an item: the reader then keeps his kind, business and contributor. */
export async function updateNewsletterItem(id: string, change: { kind?: ItemKind; business_id?: string | null; contributor_id?: string | null }): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId, userId } = ctx
  const now = new Date().toISOString()
  const { error } = await supabase.from('newsletter_items').update({ ...change, edited_by: userId, edited_at: now, updated_at: now })
    .eq('id', id).eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/newsletter')
  return {}
}

/** Yes or No on an unclear mention. The next read keeps the choice. */
export async function decideMention(id: string, yes: boolean): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId, userId } = ctx
  const now = new Date().toISOString()
  const { data, error } = await supabase.from('newsletter_mentions')
    .update({ status: yes ? 'confirmed' : 'rejected', decided_by: userId, decided_at: now, updated_at: now })
    .eq('id', id).eq('organization_id', orgId).select('issue_id').single()
  if (error) return { error: error.message }
  try { await relink(orgId, [data.issue_id]) } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
  revalidatePath('/newsletter')
  revalidatePath('/businesses')
  return {}
}

export type ContributorInput = {
  id?: string; name: string; column_name: string | null; business_id: string | null; aliases: string[]
  expected_every_days: number | null; active: boolean; notes: string | null
}

export async function saveContributor(input: ContributorInput): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx
  const name = input.name.trim()
  if (!name) return { error: 'A contributor needs a name' }
  const row = {
    name, column_name: input.column_name?.trim() || null, business_id: input.business_id || null,
    aliases: input.aliases.map((a) => a.trim()).filter(Boolean), expected_every_days: input.expected_every_days || null,
    active: input.active, notes: input.notes?.trim() || null, updated_at: new Date().toISOString(),
  }
  const { error } = input.id
    ? await supabase.from('newsletter_contributors').update(row).eq('id', input.id).eq('organization_id', orgId)
    : await supabase.from('newsletter_contributors').insert({ ...row, organization_id: orgId })
  if (error) return { error: error.code === '23505' ? `There is already a contributor called ${name}` : error.message }
  try { await relink(orgId) } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
  revalidatePath('/newsletter')
  return {}
}

export async function deleteContributor(id: string): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { error } = await ctx.supabase.from('newsletter_contributors').delete().eq('id', id).eq('organization_id', ctx.orgId)
  if (error) return { error: error.message }
  revalidatePath('/newsletter')
  return {}
}

export async function addPromise(input: { contract_id: string; kind: NlPromise['kind']; quantity: number; per: NlPromise['per']; notes: string | null }): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId, userId } = ctx
  const { data: c, error: cErr } = await supabase.from('contracts').select('id, business_id').eq('id', input.contract_id).eq('organization_id', orgId).single()
  if (cErr || !c) return { error: cErr?.message ?? 'Deal not found' }
  const { error } = await supabase.from('newsletter_promises').insert({
    organization_id: orgId, contract_id: c.id, business_id: c.business_id, kind: input.kind,
    quantity: Math.max(1, Math.round(input.quantity || 1)), per: input.per, notes: input.notes?.trim() || null, created_by: userId,
  })
  if (error) return { error: error.message }
  revalidatePath('/newsletter')
  return {}
}

export async function deletePromise(id: string): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { error } = await ctx.supabase.from('newsletter_promises').delete().eq('id', id).eq('organization_id', ctx.orgId)
  if (error) return { error: error.message }
  revalidatePath('/newsletter')
  return {}
}

/** Banners and ads are images: Tom ticks the issues they ran in. */
export async function setPromiseTick(promiseId: string, issueId: string, on: boolean): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return ctx
  const { supabase, orgId, userId } = ctx
  const { error } = on
    ? await supabase.from('newsletter_promise_ticks').upsert({ promise_id: promiseId, issue_id: issueId, organization_id: orgId, ticked_by: userId }, { onConflict: 'promise_id,issue_id', ignoreDuplicates: true })
    : await supabase.from('newsletter_promise_ticks').delete().eq('promise_id', promiseId).eq('issue_id', issueId).eq('organization_id', orgId)
  if (error) return { error: error.message }
  revalidatePath('/newsletter')
  return {}
}

export type BusinessFreebie = { id: string; date: string; kind: 'freebie' | 'competition'; headline: string | null; link_url: string | null; closes_on: string | null; issue_url: string | null }

/** Freebies and competitions the newsletter ran for one business (the business page). */
export async function getBusinessFreebies(businessId: string): Promise<BusinessFreebie[]> {
  const ctx = await context()
  if ('error' in ctx) return []
  const { data } = await ctx.supabase.from('v_newsletter_items')
    .select('id, issue_date, kind, headline, link_url, closes_on, issue_url')
    .eq('organization_id', ctx.orgId).eq('business_id', businessId).in('kind', ['freebie', 'competition'])
    .order('issue_date', { ascending: false }).limit(50)
  return (data ?? []).map((r) => ({ id: r.id, date: r.issue_date, kind: r.kind, headline: r.headline, link_url: r.link_url, closes_on: r.closes_on, issue_url: r.issue_url }))
}

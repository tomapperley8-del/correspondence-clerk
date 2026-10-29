import { MatchBusiness, MatchCardPage, MatchRules } from './match'

/** Loading shared by the mention finder (read.ts) and the item store (items-store.ts). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceClient = any

export async function pagedSelect<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

/** Businesses (merged ones left out), Club Card pages and Tom's match rules, as matchIssues() takes them. */
export async function loadMatchInputs(supabase: ServiceClient, orgId: string): Promise<{ businesses: MatchBusiness[]; pages: MatchCardPage[]; rules: MatchRules }> {
  const businesses = await pagedSelect<{ id: string; name: string; status: string | null; business_type: string | null; website: string | null; merged_into: string | null }>((a, b) =>
    supabase.from('businesses').select('id, name, status, business_type, website, merged_into').eq('organization_id', orgId).order('id').range(a, b))
  const pages = await pagedSelect<{ business_id: string; link: string; page_website_host: string | null }>((a, b) =>
    supabase.from('club_card_pages').select('business_id, link, page_website_host').eq('organization_id', orgId).not('business_id', 'is', null).is('gone_at', null).order('id').range(a, b))
  const ruleRows = await pagedSelect<{ kind: string; business_id: string | null; phrase: string | null }>((a, b) =>
    supabase.from('newsletter_match_rules').select('kind, business_id, phrase').eq('organization_id', orgId).order('id').range(a, b))
  return {
    businesses: businesses.filter((b) => !b.merged_into).map((b) => ({ id: b.id, name: b.name, status: b.status, businessType: b.business_type, website: b.website })),
    pages: pages.map((p) => ({ businessId: p.business_id, link: p.link, websiteHost: p.page_website_host })),
    rules: {
      always: new Set(ruleRows.filter((r) => r.kind === 'always' && r.business_id).map((r) => r.business_id!)),
      never: new Set(ruleRows.filter((r) => r.kind === 'never' && r.business_id).map((r) => r.business_id!)),
      aliases: ruleRows.filter((r) => r.kind === 'alias' && r.business_id && r.phrase).map((r) => ({ businessId: r.business_id!, phrase: r.phrase! })),
      ignorePhrases: ruleRows.filter((r) => r.kind === 'ignore_phrase' && r.phrase).map((r) => r.phrase!),
    },
  }
}

/**
 * Insight prompt builders and data fetchers for the Insights feature.
 *
 * Each insight pre-fetches its required data server-side, then builds a structured
 * prompt. No tool-calling — Claude receives all data in the prompt.
 *
 * Token budget: org-wide insights cap at 5 entries per business, 500 total.
 * Business-specific insights load up to 50 entries for that business.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightScope = 'org' | 'business'

export type InsightType =
  | 'briefing'
  | 'relationship_radar'
  | 'pipeline_pulse'
  | 'state_of_play'
  | 'reconnect_list'
  | 'buried_gold'
  | 'prospecting_targets'
  | 'data_health_org'
  | 'call_prep'
  | 'relationship_story'
  | 'outreach_draft'
  | 'what_did_we_agree'
  | 'next_best_action'
  | 'risk_check'
  | 'full_picture'
  | 'data_health_biz'
  | 'custom'

export const INSIGHT_METADATA: Record<
  InsightType,
  { label: string; description: string; scope: InsightScope; cacheTtlHours: number }
> = {
  briefing:             { label: 'Briefing',             description: "Today's priorities across all your businesses",        scope: 'org',      cacheTtlHours: 24 },
  relationship_radar:   { label: 'Relationship Radar',   description: 'At-risk relationships, gone quiet, flagged',          scope: 'org',      cacheTtlHours: 24 },
  pipeline_pulse:       { label: 'Pipeline Pulse',       description: 'Contracts active, expiring, and lapsed with totals',  scope: 'org',      cacheTtlHours: 24 },
  state_of_play:        { label: 'State of Play',        description: 'Full analysis: revenue, trends, what\'s working',     scope: 'org',      cacheTtlHours: 24 },
  reconnect_list:       { label: 'Reconnect List',       description: 'Businesses not contacted in 60+ days worth a nudge', scope: 'org',      cacheTtlHours: 24 },
  buried_gold:          { label: 'Buried Gold',          description: 'Forgotten commitments and context in old messages',   scope: 'org',      cacheTtlHours: 24 },
  prospecting_targets:  { label: 'Prospecting Targets',  description: 'Warm prospects based on your existing relationships', scope: 'org',      cacheTtlHours: 24 },
  data_health_org:      { label: 'Data Health',          description: 'Missing fields, incomplete records, gaps to fill',    scope: 'org',      cacheTtlHours: 24 },
  call_prep:            { label: 'Call Prep',            description: 'Right-now ready: contacts, history, deal status',     scope: 'business', cacheTtlHours: 4  },
  relationship_story:   { label: 'Relationship Story',   description: 'Full arc: how it started, key moments, where you stand', scope: 'business', cacheTtlHours: 4 },
  outreach_draft:       { label: 'Outreach Draft',       description: 'Personalised re-engagement message in your style',   scope: 'business', cacheTtlHours: 4  },
  what_did_we_agree:    { label: 'What Did We Agree',    description: 'Commitments and promises made in both directions',    scope: 'business', cacheTtlHours: 4  },
  next_best_action:     { label: 'Next Best Action',     description: 'Based on everything, the one thing to do next',      scope: 'business', cacheTtlHours: 4  },
  risk_check:           { label: 'Risk Check',           description: 'Warning signs — silence, unresolved issues, drift',  scope: 'business', cacheTtlHours: 4  },
  full_picture:         { label: 'Full Picture',         description: 'Everything about this business in one place',        scope: 'business', cacheTtlHours: 4  },
  data_health_biz:      { label: 'Data Health',          description: "What's missing or off for this specific business",   scope: 'business', cacheTtlHours: 4  },
  custom:               { label: 'Custom',               description: 'Your custom insight',                                scope: 'org',      cacheTtlHours: 24 },
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatDate(d: string | null | undefined): string {
  if (!d) return 'unknown date'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysAgo(d: string | null | undefined): number {
  if (!d) return 9999
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

function daysUntil(d: string | null | undefined): number {
  if (!d) return 9999
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000)
}

function truncate(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text
  return text.slice(0, maxChars).trimEnd() + '…'
}

function formatPreviousInsights(previous: Array<{ content: string; generated_at: string }>): string {
  if (!previous.length) return ''
  const formatted = previous
    .map((p) => `[Generated ${formatDate(p.generated_at)}]\n${truncate(p.content, 800)}`)
    .join('\n\n---\n\n')
  return `\n\n## Previous versions of this insight (for context — do not repeat verbatim)\n${formatted}`
}

// ---------------------------------------------------------------------------
// Org-wide data fetchers
// ---------------------------------------------------------------------------

async function fetchOrgContext(orgId: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('organizations')
    .select('name, business_description, industry, value_proposition, ideal_customer_profile, services_offered, typical_deal_value, email_writing_style')
    .eq('id', orgId)
    .single()
  return data
}

async function fetchOrgBusinessSummaries(orgId: string, supabase: SupabaseClient, entriesPerBusiness = 5) {
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, category, status, membership_type, email, phone, contract_start, contract_end, contract_amount, last_contacted_at, notes')
    .eq('organization_id', orgId)
    .order('name')

  if (!businesses?.length) return []

  // Fetch recent correspondence for all businesses (capped)
  const { data: allCorrespondence } = await supabase
    .from('correspondence')
    .select('id, business_id, subject, type, direction, entry_date, formatted_text_current, action_needed, due_at')
    .eq('organization_id', orgId)
    .order('entry_date', { ascending: false })
    .limit(500)

  const corrByBusiness = new Map<string, typeof allCorrespondence>()
  for (const c of allCorrespondence ?? []) {
    if (!corrByBusiness.has(c.business_id)) corrByBusiness.set(c.business_id, [])
    const arr = corrByBusiness.get(c.business_id)!
    if (arr.length < entriesPerBusiness) arr.push(c)
  }

  return businesses.map((b) => ({
    ...b,
    recentCorrespondence: corrByBusiness.get(b.id) ?? [],
  }))
}

async function fetchActionsAndInbound(orgId: string, supabase: SupabaseClient) {
  const today = new Date().toISOString().split('T')[0]

  const [{ data: actionsDue }, { data: needsReply }, { data: inbound }] = await Promise.all([
    supabase.from('correspondence')
      .select('id, subject, business_id, due_at, action_needed, formatted_text_current')
      .eq('organization_id', orgId)
      .neq('action_needed', 'none')
      .lte('due_at', today + 'T23:59:59Z')
      .order('due_at'),
    supabase.from('correspondence')
      .select('id, subject, business_id, entry_date, formatted_text_current')
      .eq('organization_id', orgId)
      .eq('direction', 'received')
      .eq('action_needed', 'medium')
      .order('entry_date', { ascending: false })
      .limit(10),
    supabase.from('inbound_queue')
      .select('id, sender_email, subject, received_at')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })
      .limit(10),
  ])

  return { actionsDue: actionsDue ?? [], needsReply: needsReply ?? [], inbound: inbound ?? [] }
}

async function fetchContractData(orgId: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('businesses')
    .select('id, name, contract_start, contract_end, contract_amount, status, membership_type')
    .eq('organization_id', orgId)
    .not('contract_end', 'is', null)
    .order('contract_end')
  return data ?? []
}

// ---------------------------------------------------------------------------
// Business-specific data fetcher (consolidated — most biz insights share data)
// ---------------------------------------------------------------------------

async function fetchBusinessInsightData(orgId: string, businessId: string, supabase: SupabaseClient) {
  const [{ data: business }, { data: contacts }, { data: correspondence }] = await Promise.all([
    supabase.from('businesses')
      .select('id, name, category, status, membership_type, email, phone, address, notes, contract_start, contract_end, contract_amount, last_contacted_at')
      .eq('id', businessId)
      .eq('organization_id', orgId)
      .single(),
    supabase.from('contacts')
      .select('id, name, role, emails, phones, notes, is_active')
      .eq('business_id', businessId)
      .eq('organization_id', orgId)
      .order('is_active', { ascending: false }),
    supabase.from('correspondence')
      .select('id, subject, type, direction, entry_date, formatted_text_current, raw_text_original, action_needed, due_at, edited_at')
      .eq('business_id', businessId)
      .eq('organization_id', orgId)
      .order('entry_date', { ascending: true })
      .limit(50),
  ])

  return { business, contacts: contacts ?? [], correspondence: correspondence ?? [] }
}

// ---------------------------------------------------------------------------
// Prompt builders — org-wide
// ---------------------------------------------------------------------------

function buildBriefingPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  actions: Awaited<ReturnType<typeof fetchActionsAndInbound>>,
  businesses: Awaited<ReturnType<typeof fetchOrgBusinessSummaries>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  const actionsText = actions.actionsDue.length
    ? actions.actionsDue.map((a) => `- ${a.subject || 'Untitled'} (due ${formatDate(a.due_at)}) — ${a.action_needed}`).join('\n')
    : 'None overdue.'

  const repliesText = actions.needsReply.length
    ? actions.needsReply.map((a) => `- ${a.subject || 'Untitled'} (${formatDate(a.entry_date)})`).join('\n')
    : 'None.'

  const inboundText = actions.inbound.length
    ? actions.inbound.map((i) => `- From: ${i.sender_email} — "${i.subject}" (${formatDate(i.received_at)})`).join('\n')
    : 'None pending.'

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return {
    systemPrompt: `You are an AI assistant embedded in Correspondence Clerk for ${orgName}. Today is ${today}. You produce clear, actionable business briefings in British English. Use markdown formatting. Be concise and prioritise what genuinely needs attention.`,
    userPrompt: `Generate a morning briefing for ${orgName}.

## Actions due today or overdue
${actionsText}

## Needs a reply
${repliesText}

## Unread inbound emails in queue
${inboundText}

## Business count
${businesses.length} businesses in the system.

Produce a briefing with three sections: (1) Urgent — what must be dealt with today, (2) On the radar — things to keep in mind this week, (3) All clear — anything worth noting is under control. Keep it scannable. No fluff.${formatPreviousInsights(previous)}`,
  }
}

function buildRelationshipRadarPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  businesses: Awaited<ReturnType<typeof fetchOrgBusinessSummaries>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  const atRisk = businesses
    .filter((b) => {
      const days = daysAgo(b.last_contacted_at)
      const hasFlag = b.recentCorrespondence.some((c) => c.action_needed && c.action_needed !== 'none')
      return days > 45 || hasFlag
    })
    .slice(0, 30)
    .map((b) => {
      const days = daysAgo(b.last_contacted_at)
      const flags = b.recentCorrespondence.filter((c) => c.action_needed && c.action_needed !== 'none')
      return `- ${b.name} (${b.category ?? b.status ?? 'unknown'}) — last contact: ${days > 9000 ? 'never' : `${days}d ago`}${flags.length ? `, ${flags.length} flagged action(s)` : ''}`
    })
    .join('\n')

  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Analyse relationship health across the business portfolio. Be direct — flag what needs attention. British English, markdown formatting.`,
    userPrompt: `Review the following businesses that may need attention. Identify the highest-risk relationships and explain why each is at risk. Group into: (1) High concern, (2) Worth watching, (3) Fine for now. Where relevant, suggest a specific action.

## Potentially at-risk businesses
${atRisk || 'No at-risk businesses found.'}${formatPreviousInsights(previous)}`,
  }
}

function buildPipelinePulsePrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  contracts: Awaited<ReturnType<typeof fetchContractData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  const now = new Date()
  const active = contracts.filter((c) => {
    const end = c.contract_end ? new Date(c.contract_end) : null
    return end && end > now
  })
  const expiring = active.filter((c) => daysUntil(c.contract_end) <= 60)
  const lapsed = contracts.filter((c) => {
    const end = c.contract_end ? new Date(c.contract_end) : null
    return end && end <= now
  })

  const totalActive = active.reduce((sum, c) => sum + (c.contract_amount ?? 0), 0)
  const totalExpiring = expiring.reduce((sum, c) => sum + (c.contract_amount ?? 0), 0)

  const formatContracts = (list: typeof contracts) =>
    list.slice(0, 20).map((c) => `- ${c.name}: £${c.contract_amount?.toLocaleString() ?? 'unknown'} — ends ${formatDate(c.contract_end)}`).join('\n')

  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Summarise the contract pipeline clearly and concisely. Use British English and markdown.`,
    userPrompt: `Summarise the current contract pipeline.

## Active contracts (${active.length} total, £${totalActive.toLocaleString()} combined)
${formatContracts(active) || 'None.'}

## Expiring within 60 days (${expiring.length}, £${totalExpiring.toLocaleString()} at risk)
${formatContracts(expiring) || 'None.'}

## Lapsed contracts (${lapsed.length})
${formatContracts(lapsed) || 'None.'}

Produce: (1) headline figures, (2) urgent renewals needed, (3) opportunities in lapsed contracts worth revisiting.${formatPreviousInsights(previous)}`,
  }
}

function buildStateOfPlayPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  businesses: Awaited<ReturnType<typeof fetchOrgBusinessSummaries>>,
  contracts: Awaited<ReturnType<typeof fetchContractData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  const byCategory = businesses.reduce<Record<string, number>>((acc, b) => {
    const cat = b.category ?? 'Uncategorised'
    acc[cat] = (acc[cat] ?? 0) + 1
    return acc
  }, {})

  const byStatus = businesses.reduce<Record<string, number>>((acc, b) => {
    const s = b.status ?? 'unknown'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  const totalContractValue = contracts.reduce((sum, c) => sum + (c.contract_amount ?? 0), 0)
  const activeContracts = contracts.filter((c) => c.contract_end && new Date(c.contract_end) > new Date())

  const categoryText = Object.entries(byCategory).map(([k, v]) => `${k}: ${v}`).join(', ')
  const statusText = Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')

  const activityBuckets = {
    active: businesses.filter((b) => daysAgo(b.last_contacted_at) <= 30).length,
    quietRecently: businesses.filter((b) => { const d = daysAgo(b.last_contacted_at); return d > 30 && d <= 90 }).length,
    dormant: businesses.filter((b) => daysAgo(b.last_contacted_at) > 90).length,
    never: businesses.filter((b) => !b.last_contacted_at).length,
  }

  return {
    systemPrompt: `You are an AI analyst for ${orgName}. Provide an honest, strategic analysis of the business portfolio. British English, markdown. Be direct about what's working and what isn't.`,
    userPrompt: `Analyse the full state of ${orgName}'s business relationships.

## Portfolio overview
- Total businesses: ${businesses.length}
- Categories: ${categoryText || 'none set'}
- Status breakdown: ${statusText || 'none set'}

## Contract values
- Total tracked: £${totalContractValue.toLocaleString()}
- Active contracts: ${activeContracts.length}
${org?.typical_deal_value ? `- Typical deal value: ${org.typical_deal_value}` : ''}

## Relationship activity (last contact)
- Active (within 30 days): ${activityBuckets.active}
- Gone quiet (30–90 days): ${activityBuckets.quietRecently}
- Dormant (90+ days): ${activityBuckets.dormant}
- Never contacted: ${activityBuckets.never}

${org?.business_description ? `## About ${orgName}\n${org.business_description}` : ''}

Provide: (1) Executive summary, (2) What's performing well, (3) What's underperforming or at risk, (4) Top 3 strategic recommendations.${formatPreviousInsights(previous)}`,
  }
}

function buildReconnectListPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  businesses: Awaited<ReturnType<typeof fetchOrgBusinessSummaries>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  const reconnect = businesses
    .filter((b) => daysAgo(b.last_contacted_at) >= 60 && b.status !== 'inactive')
    .sort((a, b) => daysAgo(a.last_contacted_at) - daysAgo(b.last_contacted_at))
    .slice(0, 25)
    .map((b) => {
      const days = daysAgo(b.last_contacted_at)
      const lastEntry = b.recentCorrespondence[0]
      return `- ${b.name} (${b.category ?? 'uncategorised'}) — ${days > 9000 ? 'never contacted' : `${days} days since last contact`}${lastEntry ? ` — last: "${truncate(lastEntry.subject ?? '', 60)}"` : ''}`
    })
    .join('\n')

  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Identify the most valuable reconnection opportunities. British English, markdown.`,
    userPrompt: `The following businesses haven't been contacted in 60+ days. Identify the most worthwhile to reach out to, and briefly explain why each is a good candidate for reconnection. Group into priority tiers.

${reconnect || 'No businesses meet this criteria — great work staying in touch!'}${formatPreviousInsights(previous)}`,
  }
}

function buildBuriedGoldPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  businesses: Awaited<ReturnType<typeof fetchOrgBusinessSummaries>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  // Find old entries with flagged actions or keywords suggesting commitments
  const candidates: string[] = []
  for (const b of businesses) {
    for (const c of b.recentCorrespondence) {
      const text = (c.formatted_text_current ?? '').toLowerCase()
      const hasCommitmentKeyword = ['agreed', 'promised', 'will send', 'follow up', 'get back', 'let you know', 'chase', 'confirm'].some((kw) => text.includes(kw))
      const age = daysAgo(c.entry_date)
      if ((c.action_needed && c.action_needed !== 'none' && age > 60) || (hasCommitmentKeyword && age > 90)) {
        candidates.push(`- ${b.name} (${formatDate(c.entry_date)}): "${truncate(c.formatted_text_current ?? c.subject ?? '', 200)}"`)
        if (candidates.length >= 40) break
      }
    }
    if (candidates.length >= 40) break
  }

  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Surface forgotten commitments and valuable context buried in old correspondence. British English, markdown. Be specific — name the business and what was agreed.`,
    userPrompt: `Review the following older correspondence entries and identify anything that looks like a forgotten commitment, a promise that may not have been followed up, or important context that might have slipped through the cracks.

## Old entries with potential commitments
${candidates.join('\n') || 'No flagged old entries found.'}

Produce a list of: (1) Likely missed follow-ups, (2) Commitments that need checking, (3) Useful context to resurface. Be specific and actionable.${formatPreviousInsights(previous)}`,
  }
}

function buildProspectingTargetsPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  businesses: Awaited<ReturnType<typeof fetchOrgBusinessSummaries>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  const activeBusinesses = businesses.filter((b) => b.status === 'active' && daysAgo(b.last_contacted_at) <= 90)
  const dormant = businesses.filter((b) => (b.status === 'inactive' || daysAgo(b.last_contacted_at) > 90) && b.email)

  const activeText = activeBusinesses.slice(0, 15).map((b) => `- ${b.name} (${b.category ?? 'unknown'}, ${b.membership_type ?? 'no membership'})`).join('\n')
  const dormantText = dormant.slice(0, 15).map((b) => `- ${b.name} (${b.category ?? 'unknown'}) — ${daysAgo(b.last_contacted_at) > 9000 ? 'never contacted' : `${daysAgo(b.last_contacted_at)}d ago`}`).join('\n')

  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Identify warm prospecting opportunities within the existing relationship network. British English, markdown.`,
    userPrompt: `Analyse the existing business relationships to identify warm prospecting opportunities.

## About ${orgName}
${org?.business_description ?? 'Not specified.'}
${org?.value_proposition ? `Value proposition: ${org.value_proposition}` : ''}
${org?.ideal_customer_profile ? `Ideal customer: ${org.ideal_customer_profile}` : ''}
${org?.services_offered ? `Services: ${org.services_offered}` : ''}

## Active relationships (good customers to learn from)
${activeText || 'None.'}

## Dormant / lapsed relationships (potential to revive)
${dormantText || 'None.'}

Produce: (1) What the best current customers have in common (patterns to target), (2) Top lapsed relationships worth reviving and why, (3) Types of businesses not yet in the system that would be a strong fit.${formatPreviousInsights(previous)}`,
  }
}

function buildDataHealthOrgPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  businesses: Awaited<ReturnType<typeof fetchOrgBusinessSummaries>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'

  const noEmail = businesses.filter((b) => !b.email)
  const noPhone = businesses.filter((b) => !b.phone)  // note: contacts have phones, businesses have phone
  const noCorrespondence = businesses.filter((b) => b.recentCorrespondence.length === 0)
  const noCategory = businesses.filter((b) => !b.category)
  const noStatus = businesses.filter((b) => !b.status)

  const format = (list: typeof businesses) => list.slice(0, 10).map((b) => `- ${b.name}`).join('\n')

  const profileFields = [
    !org?.business_description && '- Business description not set',
    !org?.industry && '- Industry not set',
    !org?.value_proposition && '- Value proposition not set',
    !org?.services_offered && '- Services offered not set',
  ].filter(Boolean).join('\n')

  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Identify data quality issues across the business portfolio. Be specific and actionable. British English, markdown.`,
    userPrompt: `Audit the data quality across ${orgName}'s portfolio.

## Businesses with no email address (${noEmail.length})
${format(noEmail) || 'None — great!'}

## Businesses with no correspondence logged (${noCorrespondence.length})
${format(noCorrespondence) || 'None — great!'}

## Businesses with no category set (${noCategory.length})
${format(noCategory) || 'None — great!'}

## Businesses with no status set (${noStatus.length})
${format(noStatus) || 'None — great!'}

## AI Context profile gaps
${profileFields || 'Profile is fully complete — great!'}

Summarise the data quality issues, prioritise the most impactful ones to fix, and give specific instructions for addressing each.${formatPreviousInsights(previous)}`,
  }
}

// ---------------------------------------------------------------------------
// Prompt builders — business-specific
// ---------------------------------------------------------------------------

function businessContextBlock(
  business: Awaited<ReturnType<typeof fetchBusinessInsightData>>['business'],
  contacts: Awaited<ReturnType<typeof fetchBusinessInsightData>>['contacts'],
  correspondence: Awaited<ReturnType<typeof fetchBusinessInsightData>>['correspondence']
): string {
  if (!business) return 'Business not found.'

  const contactsText = contacts.length
    ? contacts.map((c) => `  - ${c.name}${c.role ? ` (${c.role})` : ''}: ${(c.emails as string[] | null)?.[0] ?? 'no email'}${(c.phones as string[] | null)?.[0] ? `, ${(c.phones as string[])[0]}` : ''}${!c.is_active ? ' [inactive]' : ''}`).join('\n')
    : '  None on record.'

  const corrText = correspondence.length
    ? correspondence.map((c) => `  [${formatDate(c.entry_date)}] ${c.direction?.toUpperCase()} ${c.type ?? ''}: "${c.subject ?? 'untitled'}" — ${truncate(c.formatted_text_current ?? '', 300)}${c.action_needed && c.action_needed !== 'none' ? ` [ACTION: ${c.action_needed}${c.due_at ? `, due ${formatDate(c.due_at)}` : ''}]` : ''}`).join('\n')
    : '  No correspondence on record.'

  const contract = business.contract_end
    ? `${formatDate(business.contract_start)} – ${formatDate(business.contract_end)}, £${business.contract_amount?.toLocaleString() ?? 'unknown'}${daysUntil(business.contract_end) < 0 ? ' [EXPIRED]' : daysUntil(business.contract_end) <= 60 ? ` [EXPIRING in ${daysUntil(business.contract_end)} days]` : ''}`
    : 'No contract on record.'

  return `## Business: ${business.name}
Category: ${business.category ?? 'not set'} | Status: ${business.status ?? 'not set'} | Membership: ${business.membership_type ?? 'none'}
Email: ${business.email ?? 'not set'} | Phone: ${business.phone ?? 'not set'}
Contract: ${contract}
Last contacted: ${business.last_contacted_at ? `${daysAgo(business.last_contacted_at)} days ago` : 'unknown'}
${business.notes ? `Notes: ${truncate(business.notes, 300)}` : ''}

## Contacts
${contactsText}

## Correspondence history (${correspondence.length} entries)
${corrText}`
}

function buildCallPrepPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  return {
    systemPrompt: `You are an AI assistant preparing ${orgName} for a phone call. Be crisp, practical, and specific. British English, markdown. Produce something someone could scan in 60 seconds before picking up the phone.`,
    userPrompt: `Prepare a call brief for the following business. Include: (1) Who to ask for and their contact details, (2) What was last discussed, (3) Any outstanding actions or promises, (4) Contract status if relevant, (5) Suggested agenda or opening line.

${businessContextBlock(data.business, data.contacts, data.correspondence)}${formatPreviousInsights(previous)}`,
  }
}

function buildRelationshipStoryPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Narrate the arc of a business relationship from start to present. Be insightful and specific — highlight turning points, patterns, and the current state. British English, markdown.`,
    userPrompt: `Tell the story of ${orgName}'s relationship with this business. Cover: (1) How it started, (2) Key moments and milestones, (3) The nature of the relationship (warm/transactional/strained?), (4) Where things stand today.

${businessContextBlock(data.business, data.contacts, data.correspondence)}${formatPreviousInsights(previous)}`,
  }
}

function buildOutreachDraftPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  const writingStyle = org?.email_writing_style || 'friendly but professional, concise, no filler phrases'
  return {
    systemPrompt: `You are an AI assistant writing a re-engagement email for ${orgName}. Writing style: ${writingStyle}. Write in first person as if you are the user. Use the correspondence history to make the email feel personal and specific — never generic. British English.`,
    userPrompt: `Draft a personalised re-engagement or outreach email to this business. Use real details from the correspondence history to make it specific. Include a natural hook based on what was last discussed.

Format:
Subject: [subject line]

[email body]

${businessContextBlock(data.business, data.contacts, data.correspondence)}
${org?.value_proposition ? `\nWhat we offer: ${org.value_proposition}` : ''}${formatPreviousInsights(previous)}`,
  }
}

function buildWhatDidWeAgreePrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Extract commitments and agreements from correspondence. Be specific — name who agreed to what and when. British English, markdown.`,
    userPrompt: `Review the correspondence history and extract all commitments, promises, and agreements made in either direction. Include the date and context for each.

Produce: (1) Commitments made by ${orgName} that may need following up, (2) Commitments made by the other party that haven't been confirmed, (3) Things that were agreed but have no correspondence to confirm they happened.

${businessContextBlock(data.business, data.contacts, data.correspondence)}${formatPreviousInsights(previous)}`,
  }
}

function buildNextBestActionPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  return {
    systemPrompt: `You are an AI advisor for ${orgName}. Based on all available context, recommend the single best next action. Be specific and direct. British English, markdown.`,
    userPrompt: `Based on everything you can see about this relationship, what is the single best next action ${orgName} should take? Explain why, and provide a specific suggested message or action if appropriate.

${businessContextBlock(data.business, data.contacts, data.correspondence)}${formatPreviousInsights(previous)}`,
  }
}

function buildRiskCheckPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  return {
    systemPrompt: `You are an AI risk analyst for ${orgName}. Identify warning signs in business relationships — silence, tone changes, unresolved issues, contract risk. Be direct and specific. British English, markdown.`,
    userPrompt: `Review this business relationship for warning signs. Look for: unusual silences, tone changes in correspondence, unresolved disputes or complaints, expiring contracts without renewal discussion, missed commitments, or any other signals that the relationship may be at risk.

${businessContextBlock(data.business, data.contacts, data.correspondence)}

Produce: (1) Risk level (low/medium/high), (2) Specific warning signs found, (3) Recommended action.${formatPreviousInsights(previous)}`,
  }
}

function buildFullPicturePrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Produce a comprehensive single-page brief covering every aspect of this business relationship. British English, markdown. Structured and scannable.`,
    userPrompt: `Produce a complete picture of this business relationship. Cover: (1) Who they are and what the relationship is, (2) Full contact details, (3) Correspondence history summary, (4) Contract and financial status, (5) Outstanding actions, (6) Relationship health assessment, (7) Recommended next steps.

${businessContextBlock(data.business, data.contacts, data.correspondence)}${formatPreviousInsights(previous)}`,
  }
}

function buildDataHealthBizPrompt(
  org: Awaited<ReturnType<typeof fetchOrgContext>>,
  data: Awaited<ReturnType<typeof fetchBusinessInsightData>>,
  previous: Array<{ content: string; generated_at: string }>
): { systemPrompt: string; userPrompt: string } {
  const orgName = org?.name ?? 'your organisation'
  const b = data.business

  const issues: string[] = []
  if (!b?.email) issues.push('No business email address')
  if (!b?.phone) issues.push('No business phone number')
  if (!b?.category) issues.push('No category set')
  if (!b?.contract_end && !b?.notes) issues.push('No contract or notes on record')
  if (data.contacts.length === 0) issues.push('No contacts recorded')
  if (data.contacts.some((c) => !(c.emails as string[] | null)?.length)) issues.push('Some contacts have no email address')
  if (data.contacts.some((c) => !(c.phones as string[] | null)?.length)) issues.push('Some contacts have no phone number')
  if (data.correspondence.length === 0) issues.push('No correspondence logged')
  if (data.contacts.some((c) => !c.role)) issues.push('Some contacts have no role specified')

  return {
    systemPrompt: `You are an AI assistant for ${orgName}. Identify data quality gaps for this business record. Be specific and actionable. British English, markdown.`,
    userPrompt: `Review this business record for missing or incomplete data.

## Issues detected
${issues.length ? issues.map((i) => `- ${i}`).join('\n') : 'No obvious issues found.'}

${businessContextBlock(data.business, data.contacts, data.correspondence)}

Summarise the data gaps, explain why each matters, and provide specific instructions for what to add or correct.${formatPreviousInsights(previous)}`,
  }
}

// ---------------------------------------------------------------------------
// Main dispatch function
// ---------------------------------------------------------------------------

export async function buildInsightPrompt(
  type: InsightType,
  orgId: string,
  businessId: string | null,
  supabase: SupabaseClient,
  previousInsights: Array<{ content: string; generated_at: string }>,
  customPromptText?: string
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const org = await fetchOrgContext(orgId, supabase)
  const orgName = org?.name ?? 'your organisation'

  switch (type) {
    case 'briefing': {
      const [businesses, actions] = await Promise.all([
        fetchOrgBusinessSummaries(orgId, supabase),
        fetchActionsAndInbound(orgId, supabase),
      ])
      return buildBriefingPrompt(org, actions, businesses, previousInsights)
    }

    case 'relationship_radar': {
      const businesses = await fetchOrgBusinessSummaries(orgId, supabase)
      return buildRelationshipRadarPrompt(org, businesses, previousInsights)
    }

    case 'pipeline_pulse': {
      const contracts = await fetchContractData(orgId, supabase)
      return buildPipelinePulsePrompt(org, contracts, previousInsights)
    }

    case 'state_of_play': {
      const [businesses, contracts] = await Promise.all([
        fetchOrgBusinessSummaries(orgId, supabase),
        fetchContractData(orgId, supabase),
      ])
      return buildStateOfPlayPrompt(org, businesses, contracts, previousInsights)
    }

    case 'reconnect_list': {
      const businesses = await fetchOrgBusinessSummaries(orgId, supabase)
      return buildReconnectListPrompt(org, businesses, previousInsights)
    }

    case 'buried_gold': {
      const businesses = await fetchOrgBusinessSummaries(orgId, supabase)
      return buildBuriedGoldPrompt(org, businesses, previousInsights)
    }

    case 'prospecting_targets': {
      const businesses = await fetchOrgBusinessSummaries(orgId, supabase)
      return buildProspectingTargetsPrompt(org, businesses, previousInsights)
    }

    case 'data_health_org': {
      const businesses = await fetchOrgBusinessSummaries(orgId, supabase)
      return buildDataHealthOrgPrompt(org, businesses, previousInsights)
    }

    case 'call_prep':
    case 'relationship_story':
    case 'outreach_draft':
    case 'what_did_we_agree':
    case 'next_best_action':
    case 'risk_check':
    case 'full_picture':
    case 'data_health_biz': {
      if (!businessId) throw new Error(`${type} requires a businessId`)
      const data = await fetchBusinessInsightData(orgId, businessId, supabase)
      switch (type) {
        case 'call_prep':          return buildCallPrepPrompt(org, data, previousInsights)
        case 'relationship_story': return buildRelationshipStoryPrompt(org, data, previousInsights)
        case 'outreach_draft':     return buildOutreachDraftPrompt(org, data, previousInsights)
        case 'what_did_we_agree':  return buildWhatDidWeAgreePrompt(org, data, previousInsights)
        case 'next_best_action':   return buildNextBestActionPrompt(org, data, previousInsights)
        case 'risk_check':         return buildRiskCheckPrompt(org, data, previousInsights)
        case 'full_picture':       return buildFullPicturePrompt(org, data, previousInsights)
        case 'data_health_biz':    return buildDataHealthBizPrompt(org, data, previousInsights)
      }
      break
    }

    case 'custom': {
      if (!customPromptText) throw new Error('custom insight requires promptText')

      // Inject rich context based on scope so custom prompts have real data to work with
      if (businessId) {
        // Business-scoped: full business context (same as Call Prep / Full Picture)
        const data = await fetchBusinessInsightData(orgId, businessId, supabase)
        const context = businessContextBlock(data.business, data.contacts, data.correspondence)
        return {
          systemPrompt: `You are an AI assistant for ${orgName}. You have full access to the business data below. Be specific, concise, and actionable. British English, markdown.`,
          userPrompt: `${customPromptText}\n\n${context}${formatPreviousInsights(previousInsights)}`,
        }
      } else {
        // Org-scoped: org overview (businesses list + basic stats)
        const businesses = await fetchOrgBusinessSummaries(orgId, supabase, 3)
        const orgProfile = [
          org?.business_description && `Description: ${org.business_description}`,
          org?.industry && `Industry: ${org.industry}`,
          org?.value_proposition && `Value proposition: ${org.value_proposition}`,
          org?.services_offered && `Services: ${org.services_offered}`,
        ].filter(Boolean).join('\n')

        const businessList = businesses.slice(0, 30).map((b) => {
          const recent = b.recentCorrespondence[0]
          return `- ${b.name} (${b.category ?? 'uncategorised'}, ${b.status ?? 'unknown'}) — last contact: ${b.last_contacted_at ? `${daysAgo(b.last_contacted_at)}d ago` : 'never'}${recent ? `, last entry: "${truncate(recent.subject ?? '', 60)}"` : ''}`
        }).join('\n')

        return {
          systemPrompt: `You are an AI assistant for ${orgName}. You have access to the organisation's business portfolio data below. Be specific, concise, and actionable. British English, markdown.`,
          userPrompt: `${customPromptText}

## About ${orgName}
${orgProfile || 'No profile set.'}

## Business portfolio (${businesses.length} businesses)
${businessList || 'No businesses found.'}${formatPreviousInsights(previousInsights)}`,
        }
      }
    }
  }

  throw new Error(`Unknown insight type: ${type}`)
}

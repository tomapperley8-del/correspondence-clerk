/**
 * Chat tool definitions and execution functions
 * All tools are read-only and scoped by organization_id
 */

import { createClient } from '@/lib/supabase/server'

// ---------- Tool schemas (Anthropic tool-use format) ----------

export const CHAT_TOOL_DEFINITIONS = [
  {
    name: 'get_unreplied_inbounds',
    description:
      'Find businesses where the most recent correspondence entry is an inbound (direction=received) with no newer outbound (direction=sent). These are emails/messages that Tom hasn\'t replied to yet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Max results to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_expiring_contracts',
    description:
      'Find businesses with contract_end dates within a given range of today. Used to identify renewals that need chasing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_range: {
          type: 'number',
          description: 'Number of days either side of today to look (default 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_stale_chases',
    description:
      'Find businesses where the most recent correspondence is an outbound (direction=sent) with no reply received, and it was sent more than N days ago. These are follow-ups that need chasing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_threshold: {
          type: 'number',
          description: 'Minimum days since sent with no reply (default 5)',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_correspondence_history',
    description:
      'Get the full correspondence history for a specific business, ordered by date. Can look up by business ID or by name (ILIKE search).',
    input_schema: {
      type: 'object' as const,
      properties: {
        business_id: {
          type: 'string',
          description: 'UUID of the business (use this if you have it)',
        },
        business_name: {
          type: 'string',
          description: 'Name to search for (ILIKE match, use if you don\'t have the ID)',
        },
        limit: {
          type: 'number',
          description: 'Max entries to return (default 50)',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_businesses',
    description:
      'Search for businesses by name (ILIKE). Returns business details and primary contact info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search term for business name',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_business_summary',
    description:
      'Get a full summary for a business: details, all contacts, correspondence count, most recent correspondence date, and contract info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        business_id: {
          type: 'string',
          description: 'UUID of the business',
        },
        business_name: {
          type: 'string',
          description: 'Name to search for (ILIKE match, use if you don\'t have the ID)',
        },
      },
      required: [],
    },
  },
  {
    name: 'run_query',
    description:
      'Execute a read-only SQL query against the database and return results as JSON rows. Only SELECT statements are allowed — no INSERT, UPDATE, DELETE, DROP, ALTER, etc. Results are capped at 200 rows. Use this for ad hoc questions the other tools can\'t answer. You can query information_schema.columns to discover table/column names. IMPORTANT: Always include a WHERE organization_id = \'<org_id>\' clause when querying business data tables. The organization_id will be injected automatically as a parameter.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description: 'The SELECT query to execute. Use $1 as placeholder for organization_id.',
        },
      },
      required: ['sql'],
    },
  },
]

// ---------- Tool execution ----------

type ToolResult = { success: true; data: unknown } | { success: false; error: string }

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  organizationId: string
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_unreplied_inbounds':
        return await getUnrepliedInbounds(organizationId, params.limit as number | undefined)
      case 'get_expiring_contracts':
        return await getExpiringContracts(organizationId, params.days_range as number | undefined)
      case 'get_stale_chases':
        return await getStaleChases(
          organizationId,
          params.days_threshold as number | undefined,
          params.limit as number | undefined
        )
      case 'get_correspondence_history':
        return await getCorrespondenceHistory(
          organizationId,
          params.business_id as string | undefined,
          params.business_name as string | undefined,
          params.limit as number | undefined
        )
      case 'search_businesses':
        return await searchBusinesses(
          organizationId,
          params.query as string,
          params.limit as number | undefined
        )
      case 'get_business_summary':
        return await getBusinessSummary(
          organizationId,
          params.business_id as string | undefined,
          params.business_name as string | undefined
        )
      case 'run_query':
        return await runQuery(organizationId, params.sql as string)
      default:
        return { success: false, error: `Unknown tool: ${toolName}` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Tool ${toolName} error:`, err)
    return { success: false, error: message }
  }
}

// ---------- Individual tool implementations ----------

async function getUnrepliedInbounds(
  orgId: string,
  limit: number = 20
): Promise<ToolResult> {
  const supabase = await createClient()

  // Get the latest correspondence entry per business, then filter to those where direction=received
  const { data, error } = await supabase.rpc('get_unreplied_inbounds' as never, {
    org_id: orgId,
    result_limit: Math.min(limit, 50),
  })

  if (error) {
    // Fallback: use raw SQL approach via the general query
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('correspondence')
      .select(`
        id, subject, entry_date, direction, type,
        formatted_text_current, formatted_text_original,
        business_id,
        businesses!inner(id, name),
        contacts!inner(id, name, emails, role)
      `)
      .eq('organization_id', orgId)
      .eq('direction', 'received')
      .order('entry_date', { ascending: false })
      .limit(200)

    if (fallbackError) {
      return { success: false, error: fallbackError.message }
    }

    // Group by business and find those where the latest entry is received (no newer sent)
    const businessLatest = new Map<string, typeof fallbackData[0]>()
    const businessHasReply = new Set<string>()

    // Sort all entries to process
    const sorted = (fallbackData || []).sort(
      (a, b) => new Date(b.entry_date || 0).getTime() - new Date(a.entry_date || 0).getTime()
    )

    for (const entry of sorted) {
      const bizId = entry.business_id
      if (!businessLatest.has(bizId)) {
        businessLatest.set(bizId, entry)
      }
      if (entry.direction === 'sent') {
        businessHasReply.add(bizId)
      }
    }

    // Filter: latest is received AND no sent entry exists that's newer
    const unreplied = []
    for (const [bizId, latestEntry] of businessLatest) {
      if (latestEntry.direction === 'received' && !businessHasReply.has(bizId)) {
        const biz = latestEntry.businesses as unknown as Record<string, string> | null
        const contact = latestEntry.contacts as unknown as Record<string, unknown> | null
        unreplied.push({
          business_id: bizId,
          business_name: biz?.name,
          contact_name: contact?.name as string | undefined,
          contact_email: (contact?.emails as string[] | undefined)?.[0],
          contact_role: contact?.role as string | undefined,
          subject: latestEntry.subject,
          entry_date: latestEntry.entry_date,
          text_preview: (
            latestEntry.formatted_text_current ||
            latestEntry.formatted_text_original ||
            ''
          ).substring(0, 300),
        })
        if (unreplied.length >= limit) break
      }
    }

    return { success: true, data: unreplied }
  }

  return { success: true, data }
}

async function getExpiringContracts(
  orgId: string,
  daysRange: number = 30
): Promise<ToolResult> {
  const supabase = await createClient()

  const now = new Date()
  const from = new Date(now.getTime() - daysRange * 86400000).toISOString().split('T')[0]
  const to = new Date(now.getTime() + daysRange * 86400000).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('businesses')
    .select(`
      id, name, category, status, membership_type,
      contract_start, contract_end, contract_amount,
      contacts(id, name, emails, role)
    `)
    .eq('organization_id', orgId)
    .gte('contract_end', from)
    .lte('contract_end', to)
    .order('contract_end', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return {
    success: true,
    data: (data || []).map((b) => ({
      business_id: b.id,
      business_name: b.name,
      category: b.category,
      status: b.status,
      membership_type: b.membership_type,
      contract_start: b.contract_start,
      contract_end: b.contract_end,
      contract_amount: b.contract_amount,
      primary_contact: b.contacts?.[0] || null,
    })),
  }
}

async function getStaleChases(
  orgId: string,
  daysThreshold: number = 5,
  limit: number = 20
): Promise<ToolResult> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - daysThreshold * 86400000).toISOString()

  // Get recent sent correspondence
  const { data, error } = await supabase
    .from('correspondence')
    .select(`
      id, subject, entry_date, direction, type,
      business_id,
      businesses!inner(id, name),
      contacts!inner(id, name, emails, role)
    `)
    .eq('organization_id', orgId)
    .order('entry_date', { ascending: false })
    .limit(500)

  if (error) {
    return { success: false, error: error.message }
  }

  // Group by business — find where latest is sent and older than threshold
  const businessLatest = new Map<string, (typeof data)[0]>()
  const businessHasNewerReceived = new Map<string, boolean>()

  const sorted = (data || []).sort(
    (a, b) => new Date(b.entry_date || 0).getTime() - new Date(a.entry_date || 0).getTime()
  )

  for (const entry of sorted) {
    const bizId = entry.business_id
    if (!businessLatest.has(bizId)) {
      businessLatest.set(bizId, entry)
    }
  }

  // Check if any received entry is newer than the latest sent
  for (const entry of sorted) {
    const bizId = entry.business_id
    const latest = businessLatest.get(bizId)
    if (latest && latest.direction === 'sent' && entry.direction === 'received') {
      const latestDate = new Date(latest.entry_date || 0)
      const entryDate = new Date(entry.entry_date || 0)
      if (entryDate >= latestDate) {
        businessHasNewerReceived.set(bizId, true)
      }
    }
  }

  const stale = []
  for (const [bizId, latestEntry] of businessLatest) {
    if (
      latestEntry.direction === 'sent' &&
      latestEntry.entry_date &&
      latestEntry.entry_date < cutoff &&
      !businessHasNewerReceived.get(bizId)
    ) {
      const daysSince = Math.floor(
        (Date.now() - new Date(latestEntry.entry_date).getTime()) / 86400000
      )
      const biz = latestEntry.businesses as unknown as Record<string, string> | null
      const contact = latestEntry.contacts as unknown as Record<string, unknown> | null
      stale.push({
        business_id: bizId,
        business_name: biz?.name,
        contact_name: contact?.name as string | undefined,
        contact_email: (contact?.emails as string[] | undefined)?.[0],
        subject: latestEntry.subject,
        sent_date: latestEntry.entry_date,
        days_since_sent: daysSince,
      })
      if (stale.length >= limit) break
    }
  }

  // Sort by days since sent (oldest first)
  stale.sort((a, b) => b.days_since_sent - a.days_since_sent)

  return { success: true, data: stale }
}

async function getCorrespondenceHistory(
  orgId: string,
  businessId?: string,
  businessName?: string,
  limit: number = 50
): Promise<ToolResult> {
  const supabase = await createClient()

  // Resolve business ID from name if needed
  let resolvedId = businessId
  if (!resolvedId && businessName) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('organization_id', orgId)
      .ilike('name', `%${businessName}%`)
      .limit(1)
      .single()

    if (!biz) {
      return { success: false, error: `No business found matching "${businessName}"` }
    }
    resolvedId = biz.id
  }

  if (!resolvedId) {
    return { success: false, error: 'Provide either business_id or business_name' }
  }

  const { data, error } = await supabase
    .from('correspondence')
    .select(`
      id, subject, entry_date, direction, type,
      formatted_text_current, formatted_text_original, raw_text_original,
      action_needed, due_at,
      contacts!inner(id, name, role)
    `)
    .eq('organization_id', orgId)
    .eq('business_id', resolvedId)
    .order('entry_date', { ascending: false })
    .limit(Math.min(limit, 100))

  if (error) {
    return { success: false, error: error.message }
  }

  return {
    success: true,
    data: (data || []).map((c) => ({
      id: c.id,
      subject: c.subject,
      entry_date: c.entry_date,
      direction: c.direction,
      type: c.type,
      contact_name: (c.contacts as unknown as Record<string, unknown> | null)?.name as string | undefined,
      text: (
        c.formatted_text_current ||
        c.formatted_text_original ||
        c.raw_text_original ||
        ''
      ).substring(0, 500),
      action_needed: c.action_needed,
      due_at: c.due_at,
    })),
  }
}

async function searchBusinesses(
  orgId: string,
  query: string,
  limit: number = 10
): Promise<ToolResult> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('businesses')
    .select(`
      id, name, category, status, membership_type,
      email, phone, address, notes,
      contract_start, contract_end, contract_amount,
      contacts(id, name, emails, phones, role)
    `)
    .eq('organization_id', orgId)
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(Math.min(limit, 30))

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

async function getBusinessSummary(
  orgId: string,
  businessId?: string,
  businessName?: string
): Promise<ToolResult> {
  const supabase = await createClient()

  // Resolve ID
  let resolvedId = businessId
  if (!resolvedId && businessName) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('organization_id', orgId)
      .ilike('name', `%${businessName}%`)
      .limit(1)
      .single()

    if (!biz) {
      return { success: false, error: `No business found matching "${businessName}"` }
    }
    resolvedId = biz.id
  }

  if (!resolvedId) {
    return { success: false, error: 'Provide either business_id or business_name' }
  }

  // Fetch business + contacts
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select(`
      id, name, category, status, membership_type,
      email, phone, address, notes,
      contract_start, contract_end, contract_amount,
      last_contacted_at,
      contacts(id, name, emails, phones, role, notes)
    `)
    .eq('id', resolvedId)
    .eq('organization_id', orgId)
    .single()

  if (bizError || !business) {
    return { success: false, error: bizError?.message || 'Business not found' }
  }

  // Fetch correspondence stats
  const { count } = await supabase
    .from('correspondence')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('business_id', resolvedId)

  // Fetch most recent correspondence
  const { data: recent } = await supabase
    .from('correspondence')
    .select('id, subject, entry_date, direction, type')
    .eq('organization_id', orgId)
    .eq('business_id', resolvedId)
    .order('entry_date', { ascending: false })
    .limit(5)

  return {
    success: true,
    data: {
      ...business,
      correspondence_count: count || 0,
      recent_correspondence: recent || [],
    },
  }
}

// ---------- run_query — general-purpose read-only SQL ----------

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i

async function runQuery(orgId: string, sql: string): Promise<ToolResult> {
  // Strip trailing semicolons and trim
  const trimmed = sql.trim().replace(/;+\s*$/, '')

  // Must start with SELECT or WITH
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    return { success: false, error: 'Only SELECT queries (or WITH ... SELECT) are allowed.' }
  }

  // Reject write operations
  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    return { success: false, error: 'Query rejected: contains forbidden keyword. Only SELECT queries are allowed.' }
  }

  // Reject multiple statements
  if (/;\s*\S/.test(trimmed)) {
    return { success: false, error: 'Only single statements are allowed.' }
  }

  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc('run_readonly_query' as never, {
      query_text: trimmed,
      org_id: orgId,
      row_limit: 200,
    })

    if (error) {
      return { success: false, error: `Query error: ${error.message}` }
    }

    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: `Query execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

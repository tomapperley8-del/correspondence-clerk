/**
 * Prospect database operations
 * Manages marketing prospects in Supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ScoredProspect } from './prospect-scorer'

let supabaseClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseClient
}

export interface MarketingProspect {
  id: string
  company_number: string | null
  company_name: string
  sic_codes: string[] | null
  address: Record<string, unknown> | null
  email: string | null
  phone: string | null
  website: string | null
  score: number | null
  status: 'new' | 'contacted' | 'replied' | 'converted' | 'rejected' | 'unsubscribed'
  industry: string | null
  employee_count: string | null
  notes: string | null
  contacted_at: string | null
  last_email_sent_at: string | null
  email_count: number
  smartlead_lead_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Save a scored prospect to the database
 */
export async function saveProspect(
  prospect: ScoredProspect
): Promise<MarketingProspect | null> {
  // Check for existing prospect by company number
  if (prospect.company_number) {
    const { data: existing } = await getSupabase()
      .from('marketing_prospects')
      .select('id')
      .eq('company_number', prospect.company_number)
      .single()

    if (existing) {
      // Update existing
      const { data, error } = await getSupabase()
        .from('marketing_prospects')
        .update({
          score: prospect.score,
          phone: prospect.phone || null,
          website: prospect.website || null,
          email: prospect.email || null,
          industry: prospect.industry || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating prospect:', error)
        return null
      }

      return data
    }
  }

  // Insert new prospect
  const { data, error } = await getSupabase()
    .from('marketing_prospects')
    .insert({
      company_number: prospect.company_number || null,
      company_name: prospect.company_name,
      sic_codes: prospect.sic_codes || null,
      address: prospect.address ? { formatted: prospect.address } : null,
      email: prospect.email || null,
      phone: prospect.phone || null,
      website: prospect.website || null,
      score: prospect.score,
      status: 'new',
      industry: prospect.industry || null,
      employee_count: prospect.employee_count || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving prospect:', error)
    return null
  }

  return data
}

/**
 * Batch save prospects
 */
export async function saveProspects(
  prospects: ScoredProspect[]
): Promise<{ saved: number; skipped: number }> {
  let saved = 0
  let skipped = 0

  for (const prospect of prospects) {
    const result = await saveProspect(prospect)
    if (result) {
      saved++
    } else {
      skipped++
    }
  }

  return { saved, skipped }
}

/**
 * Get prospects ready for cold email (score >= threshold, not contacted recently)
 */
export async function getProspectsForOutreach(
  scoreThreshold: number = 70,
  limit: number = 100
): Promise<MarketingProspect[]> {
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  const { data, error } = await getSupabase()
    .from('marketing_prospects')
    .select('*')
    .eq('status', 'new')
    .gte('score', scoreThreshold)
    .not('email', 'is', null)
    .or(`last_email_sent_at.is.null,last_email_sent_at.lt.${threeDaysAgo.toISOString()}`)
    .order('score', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching prospects:', error)
    return []
  }

  return data || []
}

/**
 * Mark a prospect as contacted
 */
export async function markProspectContacted(
  prospectId: string,
  smartleadLeadId?: string
): Promise<boolean> {
  // Get current email count first
  const { data: prospect } = await getSupabase()
    .from('marketing_prospects')
    .select('email_count')
    .eq('id', prospectId)
    .single()

  const currentCount = prospect?.email_count || 0

  const { error } = await getSupabase()
    .from('marketing_prospects')
    .update({
      status: 'contacted',
      contacted_at: new Date().toISOString(),
      last_email_sent_at: new Date().toISOString(),
      email_count: currentCount + 1,
      smartlead_lead_id: smartleadLeadId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospectId)

  if (error) {
    const { error: updateError } = await getSupabase()
      .from('marketing_prospects')
      .update({
        status: 'contacted',
        contacted_at: new Date().toISOString(),
        last_email_sent_at: new Date().toISOString(),
        smartlead_lead_id: smartleadLeadId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospectId)

    if (updateError) {
      console.error('Error marking prospect contacted:', updateError)
      return false
    }
  }

  return true
}

/**
 * Mark a prospect as replied
 */
export async function markProspectReplied(
  prospectId: string
): Promise<boolean> {
  const { error } = await getSupabase()
    .from('marketing_prospects')
    .update({
      status: 'replied',
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospectId)

  if (error) {
    console.error('Error marking prospect replied:', error)
    return false
  }

  return true
}

/**
 * Mark a prospect as converted
 */
export async function markProspectConverted(
  prospectId: string
): Promise<boolean> {
  const { error } = await getSupabase()
    .from('marketing_prospects')
    .update({
      status: 'converted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospectId)

  if (error) {
    console.error('Error marking prospect converted:', error)
    return false
  }

  return true
}

/**
 * Get prospect statistics
 */
export async function getProspectStats(): Promise<{
  total: number
  new: number
  contacted: number
  replied: number
  converted: number
  avgScore: number
}> {
  const { data, error } = await getSupabase()
    .from('marketing_prospects')
    .select('status, score')

  if (error || !data) {
    return {
      total: 0,
      new: 0,
      contacted: 0,
      replied: 0,
      converted: 0,
      avgScore: 0,
    }
  }

  const total = data.length
  const statusCounts = data.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const scores = data.map((p) => p.score).filter((s): s is number => s !== null)
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0

  return {
    total,
    new: statusCounts['new'] || 0,
    contacted: statusCounts['contacted'] || 0,
    replied: statusCounts['replied'] || 0,
    converted: statusCounts['converted'] || 0,
    avgScore,
  }
}

/**
 * Check if a company number already exists
 */
export async function prospectExists(companyNumber: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('marketing_prospects')
    .select('id')
    .eq('company_number', companyNumber)
    .single()

  return !!data
}

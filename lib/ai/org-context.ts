/**
 * Shared org context fetcher for AI features.
 * Provides organisation details (name, industry, description, etc.)
 * that AI prompts need for context-aware responses.
 */

import { createClient } from '@/lib/supabase/server'

export type OrgContext = {
  name: string | null
  business_description: string | null
  industry: string | null
  value_proposition: string | null
  ideal_customer_profile: string | null
  services_offered: string | null
  typical_deal_value: string | null
  email_writing_style: string | null
}

const ORG_CONTEXT_FIELDS = 'name, business_description, industry, value_proposition, ideal_customer_profile, services_offered, typical_deal_value, email_writing_style'

/**
 * Fetch organisation context for AI prompts.
 * Returns null if org not found.
 */
export async function getOrgContext(orgId: string): Promise<OrgContext | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organizations')
    .select(ORG_CONTEXT_FIELDS)
    .eq('id', orgId)
    .single()

  if (error || !data) return null
  return data as OrgContext
}

/** Build a concise description string from org context (for system prompts) */
export function buildOrgDescription(org: OrgContext): string {
  const parts = [
    org.business_description,
    org.industry ? `Industry: ${org.industry}` : '',
  ].filter(Boolean)
  return parts.join('. ')
}

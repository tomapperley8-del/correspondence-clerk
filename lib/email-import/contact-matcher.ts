import { SupabaseClient } from '@supabase/supabase-js'

export interface ContactMatch {
  businessId: string
  contactId: string
}

/**
 * Builds a lookup map of email → {businessId, contactId} for all contacts in the org.
 * Contacts are scoped to businesses; this joins through businesses to get org contacts.
 * Walks both normalized_email and the emails[] JSONB array per contact.
 */
export async function buildContactEmailMap(
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<string, ContactMatch>> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, business_id, normalized_email, emails')
    .eq('businesses.organization_id', orgId)
    .not('normalized_email', 'is', null)

  // Fallback: fetch via join if the above doesn't work with RLS
  const { data: contactsViaJoin } = await supabase.rpc('get_org_contacts_with_emails', {
    p_org_id: orgId,
  })

  const rows = contactsViaJoin ?? contacts ?? []
  const map = new Map<string, ContactMatch>()

  for (const c of rows) {
    const match: ContactMatch = { businessId: c.business_id, contactId: c.id }

    // Primary normalized email
    if (c.normalized_email) {
      map.set(c.normalized_email.toLowerCase(), match)
    }

    // Additional emails in the JSONB array
    const emails: string[] = Array.isArray(c.emails)
      ? c.emails
      : typeof c.emails === 'string'
        ? JSON.parse(c.emails)
        : []

    for (const email of emails) {
      if (email && typeof email === 'string') {
        map.set(email.toLowerCase(), match)
      }
    }
  }

  return map
}

/**
 * Fetches all contacts for an org in a single query using organization_id directly.
 * Contacts have organization_id, so no join through businesses is needed.
 */
export async function buildContactEmailMapDirect(
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<string, ContactMatch>> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, business_id, normalized_email, emails')
    .eq('organization_id', orgId)

  if (!contacts || contacts.length === 0) {
    return new Map()
  }

  const map = new Map<string, ContactMatch>()

  for (const c of contacts) {
    const match: ContactMatch = { businessId: c.business_id, contactId: c.id }

    if (c.normalized_email) {
      map.set(c.normalized_email.toLowerCase(), match)
    }

    const emails: string[] = Array.isArray(c.emails)
      ? c.emails
      : typeof c.emails === 'string'
        ? (() => { try { return JSON.parse(c.emails) } catch { return [] } })()
        : []

    for (const email of emails) {
      if (email && typeof email === 'string') {
        map.set(email.toLowerCase(), match)
      }
    }
  }

  return map
}

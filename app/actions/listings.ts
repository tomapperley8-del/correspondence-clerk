'use server'

// What's On listings (UI overhaul Stage 20): the Listings tab and the business page card.
// The rows come from the nightly read (lib/listings/sync.ts); Tom's choices here are kept by it.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { syncAndRecord, type ListingSyncResult } from '@/lib/listings/sync'

export type ListingStatus = 'hidden' | 'live' | 'possible' | 'cleo_replied' | 'with_cleo' | 'not_sent'

export type Listing = {
  id: string
  source: 'form' | 'email'
  title: string
  requester_name: string | null
  requester_email: string | null
  event_when: string | null
  business_id: string | null
  business_name: string | null
  entry_ids: string[]
  /** Where the latest email about it is filed, for "Open email" */
  entry_business_id: string | null
  asked_at: string | null
  sent_to_cleo_at: string | null
  cleo_replied_at: string | null
  cleo_note: string | null
  told_at: string | null
  event_links: string[]
  website_state: 'live' | 'possible' | 'none'
  match_kind: string | null
  website_url: string | null
  website_title: string | null
  website_published_at: string | null
  event_starts_at: string | null
  website_gone_at: string | null
  status: ListingStatus
  is_open: boolean
}

export type ListingsData = {
  listings: Listing[]
  lastRun: { ran_at: string; ok: boolean; error: string | null } | null
  /** For Link to business: every business that isn't merged or Not a business */
  businesses: { id: string; name: string }[]
}

const COLUMNS = 'id, source, title, requester_name, requester_email, event_when, business_id, business_name, entry_ids, entry_business_id, asked_at, sent_to_cleo_at, cleo_replied_at, cleo_note, told_at, event_links, website_state, match_kind, website_url, website_title, website_published_at, event_starts_at, website_gone_at, status, is_open'

async function context() {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' as const }
  const supabase = await createClient()
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organization found' as const }
  return { supabase, orgId }
}

function refresh() {
  revalidatePath('/listings')
  revalidatePath('/businesses/[id]', 'page')
}

export async function getListings(): Promise<{ data?: ListingsData; error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return { error: ctx.error }
  const [rows, run, biz] = await Promise.all([
    ctx.supabase.from('v_listing_requests').select(COLUMNS).eq('organization_id', ctx.orgId)
      .order('asked_at', { ascending: false, nullsFirst: false }).limit(2000),
    ctx.supabase.from('listing_sync_runs').select('ran_at, ok, error').eq('organization_id', ctx.orgId)
      .order('ran_at', { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.from('businesses').select('id, name').eq('organization_id', ctx.orgId)
      .is('merged_into', null).or('status.is.null,status.neq.Not a business').order('name').limit(5000),
  ])
  if (rows.error) return { error: rows.error.message }
  return { data: { listings: (rows.data ?? []) as Listing[], lastRun: run.data ?? null, businesses: biz.data ?? [] } }
}

export async function getBusinessListings(businessId: string): Promise<Listing[]> {
  const ctx = await context()
  if ('error' in ctx) return []
  const { data } = await ctx.supabase.from('v_listing_requests').select(COLUMNS)
    .eq('organization_id', ctx.orgId).eq('business_id', businessId).neq('status', 'hidden')
    .order('asked_at', { ascending: false, nullsFirst: false }).limit(50)
  return (data ?? []) as Listing[]
}

async function update(id: string, patch: Record<string, unknown>): Promise<{ error?: string }> {
  const ctx = await context()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await ctx.supabase.from('listing_requests')
    .update({ ...patch, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id).eq('organization_id', ctx.orgId)
  if (error) return { error: error.message }
  refresh()
  return {}
}

/** "Confirm": the possible match is the one. */
export async function confirmListingMatch(id: string) {
  return update(id, { website_state: 'live', match_kind: 'confirmed' })
}

/** "Not it": forget this event for the request; the next read looks again without it. */
export async function rejectListingMatch(id: string) {
  const ctx = await context()
  if ('error' in ctx) return { error: ctx.error }
  const { data: row, error } = await ctx.supabase.from('listing_requests')
    .select('website_event_id, rejected_event_ids').eq('id', id).eq('organization_id', ctx.orgId).single()
  if (error || !row) return { error: error?.message ?? 'Not found' }
  const rejected = [...new Set([...(row.rejected_event_ids ?? []), ...(row.website_event_id ? [row.website_event_id] : [])])]
  return update(id, {
    website_state: 'none', match_kind: null, website_event_id: null, website_url: null, website_title: null,
    website_published_at: null, event_starts_at: null, rejected_event_ids: rejected,
  })
}

/** "Mark as listed": Tom knows it's on the website though the read didn't find it. */
export async function markListingLive(id: string) {
  return update(id, { website_state: 'live', match_kind: 'manual' })
}

/** Undo for Confirm and Mark as listed: back to what the next read finds. */
export async function clearListingDecision(id: string) {
  return update(id, { website_state: 'none', match_kind: null, checked_at: null })
}

/** "Not a listing": hide it (an email that isn't a request). Undo with showListing. */
export async function hideListing(id: string) {
  return update(id, { hidden_at: new Date().toISOString() })
}

export async function showListing(id: string) {
  return update(id, { hidden_at: null })
}

/** Moves a request to another business (or clears it); the read keeps Tom's choice. */
export async function setListingBusiness(id: string, businessId: string | null) {
  return update(id, { business_id: businessId, business_set_by_hand: businessId !== null })
}

/** "Check the website now": the nightly read, run for this org now. */
export async function checkListingsNow(): Promise<ListingSyncResult | { ok: false; error: string }> {
  const ctx = await context()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const result = await syncAndRecord(createServiceRoleClient(), ctx.orgId)
  refresh()
  return result
}

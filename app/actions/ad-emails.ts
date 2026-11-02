'use server'

// Ad emails on Data health (Stage 17b (5)): Dawn's and James's emails about ads are linked to the advertiser
// they are about. Sure matches are linked by the data script; the rest are listed here to Confirm (the email
// then also shows on that business, as a linked entry) or say it is not that business. Each change is a batch
// in cc_phase0_backup ('ad-email-…') that Undo takes back.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type AdEmailMatch = {
  link_id: string
  correspondence_id: string
  business_id: string
  business_name: string
  entry_date: string
  subject: string | null
  contact_name: string | null
  why: string | null
}
export type AdEmailResult = { ok: number; batch?: string; error?: string }

async function who() {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' as const }
  return { supabase, orgId }
}

const batchId = () => `ad-email-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`

export async function getAdEmailMatches(): Promise<{ data?: AdEmailMatch[]; error?: string }> {
  const w = await who()
  if ('error' in w) return { error: w.error }
  const { data, error } = await w.supabase.from('v_ad_emails_to_match')
    .select('link_id, correspondence_id, business_id, business_name, entry_date, subject, contact_name, why')
    .eq('organization_id', w.orgId).order('entry_date', { ascending: false }).limit(500)
  if (error) return { error: error.message }
  return { data: (data ?? []) as AdEmailMatch[] }
}

/** Confirm: the email is linked to the business (it stays on its own record too). */
export async function confirmAdEmails(linkIds: string[]): Promise<AdEmailResult> {
  const w = await who()
  if ('error' in w) return { ok: 0, error: w.error }
  if (linkIds.length === 0) return { ok: 0 }
  const batch = batchId()
  const svc = createServiceRoleClient()
  const { data: links, error } = await w.supabase.from('ad_email_links').select('id, correspondence_id, business_id, state')
    .in('id', linkIds).eq('organization_id', w.orgId).eq('state', 'pending')
  if (error) return { ok: 0, error: error.message }
  const backup: { table_name: string; row_id: string; before_row: Record<string, unknown>; reason: string }[] = []
  let ok = 0
  for (const l of links ?? []) {
    const { data: entry } = await svc.from('correspondence').select('id, business_id, linked_business_ids').eq('id', l.correspondence_id).single()
    if (!entry) continue
    const current: string[] = entry.linked_business_ids ?? []
    if (entry.business_id !== l.business_id && !current.includes(l.business_id)) {
      backup.push({ table_name: 'correspondence', row_id: entry.id, before_row: { linked_business_ids: current }, reason: batch })
      const { error: e } = await svc.from('correspondence').update({ linked_business_ids: [...current, l.business_id] }).eq('id', entry.id)
      if (e) return { ok, batch: ok > 0 ? batch : undefined, error: e.message }
    }
    backup.push({ table_name: 'ad_email_links_state', row_id: l.id, before_row: { state: 'pending' }, reason: batch })
    await svc.from('ad_email_links').update({ state: 'confirmed' }).eq('id', l.id)
    ok++
  }
  if (backup.length > 0) await svc.from('cc_phase0_backup').insert(backup)
  revalidatePath('/data-health')
  revalidatePath('/advertising')
  return { ok, batch: ok > 0 ? batch : undefined }
}

/** "Not this business": closed and never offered again for that email. */
export async function rejectAdEmails(linkIds: string[]): Promise<AdEmailResult> {
  const w = await who()
  if ('error' in w) return { ok: 0, error: w.error }
  if (linkIds.length === 0) return { ok: 0 }
  const batch = batchId()
  const { data, error } = await w.supabase.from('ad_email_links').update({ state: 'rejected' })
    .in('id', linkIds).eq('organization_id', w.orgId).eq('state', 'pending').select('id')
  if (error) return { ok: 0, error: error.message }
  const ids = (data ?? []).map((d: { id: string }) => d.id)
  if (ids.length > 0) {
    await createServiceRoleClient().from('cc_phase0_backup').insert(
      ids.map((id) => ({ table_name: 'ad_email_links_state', row_id: id, before_row: { state: 'pending' }, reason: batch })),
    )
  }
  revalidatePath('/data-health')
  return { ok: ids.length, batch: ids.length > 0 ? batch : undefined }
}

/** Take back one batch: links added to emails go, and the suggestions return to waiting. */
export async function undoAdEmailReview(batch: string): Promise<{ restored: number; error?: string }> {
  const w = await who()
  if ('error' in w) return { restored: 0, error: w.error }
  if (!/^ad-email-[\w-]+$/.test(batch)) return { restored: 0, error: 'Not an ad email batch' }
  const svc = createServiceRoleClient()
  const { data: rows, error } = await svc.from('cc_phase0_backup').select('table_name, row_id, before_row').eq('reason', batch)
  if (error) return { restored: 0, error: error.message }
  let restored = 0
  for (const r of rows ?? []) {
    if (r.table_name === 'correspondence') {
      await svc.from('correspondence').update({ linked_business_ids: (r.before_row as { linked_business_ids: string[] }).linked_business_ids }).eq('id', r.row_id)
    } else if (r.table_name === 'ad_email_links_state') {
      await svc.from('ad_email_links').update({ state: (r.before_row as { state: string }).state }).eq('id', r.row_id).eq('organization_id', w.orgId)
      restored++
    }
  }
  revalidatePath('/data-health')
  revalidatePath('/advertising')
  return { restored }
}

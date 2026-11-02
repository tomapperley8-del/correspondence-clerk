'use server'

// Sent email to review (Stage 17b): sent mail from tom@ and info@ that matched no contact or business
// is held in mail_scan (view v_sent_mail_to_review, one row per recipient address). Choose a business to
// file it (and remember the company domain), or Ignore it. Each change is a batch in cc_phase0_backup
// ('sent-review-…') that Undo takes back. Nothing is sent or changed in Outlook.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserOrganizationId } from '@/lib/auth-helpers'

export type SentMailToReview = {
  recipient: string
  recipient_name: string | null
  n: number
  last_sent: string | null
  subjects: string[] | null
  mailboxes: string[] | null
}

async function who() {
  const supabase = await createClient()
  const { data: { user } } = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' as const }
  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return { error: 'No organisation found' as const }
  return { supabase, orgId }
}

const batchId = () => `sent-review-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`

export async function getSentMailToReview(): Promise<{ data?: { rows: SentMailToReview[]; businesses: { id: string; name: string }[] }; error?: string }> {
  const w = await who()
  if ('error' in w) return { error: w.error }
  const [rows, businesses] = await Promise.all([
    w.supabase.from('v_sent_mail_to_review').select('recipient, recipient_name, n, last_sent, subjects, mailboxes')
      .eq('organization_id', w.orgId).order('last_sent', { ascending: false }).limit(1000),
    w.supabase.from('businesses').select('id, name').eq('organization_id', w.orgId).is('merged_into', null).order('name').limit(5000),
  ])
  if (rows.error) return { error: rows.error.message }
  return { data: { rows: (rows.data ?? []) as SentMailToReview[], businesses: (businesses.data ?? []) as { id: string; name: string }[] } }
}

export async function fileSentMailToBusiness(recipients: string[], businessId: string): Promise<{ ok: number; batch?: string; error?: string }> {
  const w = await who()
  if ('error' in w) return { ok: 0, error: w.error }
  if (recipients.length === 0) return { ok: 0 }
  const batch = batchId()
  const { data, error } = await w.supabase.rpc('resolve_sent_mail', { p_org: w.orgId, p_keys: recipients, p_business: businessId, p_batch: batch })
  if (error) return { ok: 0, error: error.message }
  revalidatePath('/data-health')
  revalidatePath('/businesses')
  return { ok: Number(data ?? 0), batch }
}

export async function ignoreSentMail(recipients: string[]): Promise<{ ok: number; batch?: string; error?: string }> {
  const w = await who()
  if ('error' in w) return { ok: 0, error: w.error }
  if (recipients.length === 0) return { ok: 0 }
  const batch = batchId()
  const { data, error } = await w.supabase.rpc('ignore_sent_mail', { p_org: w.orgId, p_keys: recipients, p_batch: batch })
  if (error) return { ok: 0, error: error.message }
  revalidatePath('/data-health')
  return { ok: Number(data ?? 0), batch }
}

export async function undoSentMailBatch(batch: string): Promise<{ emails: number; contacts: number; kept: number; error?: string }> {
  const w = await who()
  if ('error' in w) return { emails: 0, contacts: 0, kept: 0, error: w.error }
  const { data, error } = await w.supabase.rpc('undo_sent_mail_batch', { p_org: w.orgId, p_batch: batch })
  if (error) return { emails: 0, contacts: 0, kept: 0, error: error.message }
  revalidatePath('/data-health')
  revalidatePath('/businesses')
  const d = (data ?? {}) as { emails?: number; contacts?: number; kept?: number }
  return { emails: d.emails ?? 0, contacts: d.contacts ?? 0, kept: d.kept ?? 0 }
}

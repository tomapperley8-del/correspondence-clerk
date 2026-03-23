import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { formatCorrespondence } from '@/lib/ai/formatter'
import { isThreadSplitResponse } from '@/lib/ai/types'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET (same pattern as marketing cron routes)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()

  // Atomically claim up to 20 pending items
  // Two-step: select then update (Supabase doesn't support UPDATE...RETURNING with filters cleanly)
  const { data: pendingItems } = await supabase
    .from('import_queue')
    .select('id, correspondence_id, org_id, retry_count')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20)

  if (!pendingItems || pendingItems.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const ids = pendingItems.map((item) => item.id)

  // Mark as processing
  await supabase
    .from('import_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .in('id', ids)

  let processed = 0

  for (const item of pendingItems) {
    try {
      // Fetch the correspondence row
      const { data: entry } = await supabase
        .from('correspondence')
        .select('id, raw_text_original, formatting_status')
        .eq('id', item.correspondence_id)
        .single()

      if (!entry) {
        await supabase
          .from('import_queue')
          .update({ status: 'done', updated_at: new Date().toISOString() })
          .eq('id', item.id)
        continue
      }

      // Already formatted (e.g. user manually triggered retry)
      if (entry.formatting_status === 'formatted') {
        await supabase
          .from('import_queue')
          .update({ status: 'done', updated_at: new Date().toISOString() })
          .eq('id', item.id)
        continue
      }

      if (!entry.raw_text_original) {
        await supabase
          .from('import_queue')
          .update({ status: 'failed', error: 'No raw text', updated_at: new Date().toISOString() })
          .eq('id', item.id)
        continue
      }

      // Call AI formatter directly (not server action — no user session in cron)
      const result = await formatCorrespondence(entry.raw_text_original, false)

      if (!result.success) {
        const newRetry = item.retry_count + 1
        await supabase
          .from('import_queue')
          .update({
            status: newRetry >= 3 ? 'failed' : 'pending',
            retry_count: newRetry,
            error: result.error,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
        continue
      }

      // Thread split responses aren't expected for single bulk-imported emails
      if (isThreadSplitResponse(result.data)) {
        await supabase
          .from('import_queue')
          .update({
            status: 'failed',
            error: 'Thread split not supported for bulk imports',
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
        continue
      }

      const aiData = result.data

      // Update correspondence with formatted text
      await supabase
        .from('correspondence')
        .update({
          formatted_text_original: aiData.formatted_text,
          formatted_text_current: aiData.formatted_text,
          subject: aiData.subject_guess || entry.raw_text_original.split('\n')[0]?.slice(0, 100),
          type: aiData.entry_type_guess ?? 'Email',
          formatting_status: 'formatted',
          ai_metadata: {
            bulk_import: true,
            formatted_by_queue: true,
            formatted_at: new Date().toISOString(),
          },
        })
        .eq('id', item.correspondence_id)

      await supabase
        .from('import_queue')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', item.id)

      processed++
    } catch (err) {
      console.error(`Import queue error for item ${item.id}:`, err)
      const newRetry = item.retry_count + 1
      await supabase
        .from('import_queue')
        .update({
          status: newRetry >= 3 ? 'failed' : 'pending',
          retry_count: newRetry,
          error: err instanceof Error ? err.message : 'Unknown error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
    }
  }

  return NextResponse.json({ processed, attempted: pendingItems.length })
}

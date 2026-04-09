import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const maxDuration = 30

// DELETE inbound_queue rows older than 90 days that are filed or discarded.
// Pending rows are kept — they may still need manual triage.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('inbound_queue')
    .delete()
    .in('status', ['filed', 'discarded'])
    .lt('received_at', cutoff)
    .select('id')

  if (error) {
    console.error('[cleanup-inbound-queue] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cleanup-inbound-queue] deleted ${data?.length ?? 0} rows`)
  return NextResponse.json({ deleted: data?.length ?? 0 })
}

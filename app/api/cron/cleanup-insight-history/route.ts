import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const maxDuration = 30

// DELETE insight_history rows older than 6 months.
// Recent history is kept for comparison; older snapshots have no practical value.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('insight_history')
    .delete()
    .lt('generated_at', cutoff)
    .select('id')

  if (error) {
    console.error('[cleanup-insight-history] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cleanup-insight-history] deleted ${data?.length ?? 0} rows`)
  return NextResponse.json({ deleted: data?.length ?? 0 })
}

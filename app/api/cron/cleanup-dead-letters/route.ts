import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const maxDuration = 30

// DELETE email_dead_letters rows older than 30 days.
// Gives plenty of time to investigate + retry before records are purged.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('email_dead_letters')
    .delete()
    .lt('created_at', cutoff)
    .select('id')

  if (error) {
    console.error('[cleanup-dead-letters] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cleanup-dead-letters] deleted ${data?.length ?? 0} rows`)
  return NextResponse.json({ deleted: data?.length ?? 0 })
}

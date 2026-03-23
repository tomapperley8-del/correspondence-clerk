import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Retrieves a stored scan result from temporary_email_data by scanId.
 * Used by import wizard pages after the scan completes.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scanId = request.nextUrl.searchParams.get('scanId')
  if (!scanId) return NextResponse.json({ error: 'Missing scanId' }, { status: 400 })

  const { data } = await supabase
    .from('temporary_email_data')
    .select('email_data, expires_at')
    .eq('user_id', user.id)
    .eq('token', scanId)
    .single()

  if (!data) return NextResponse.json({ error: 'Scan not found or expired' }, { status: 404 })

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Scan expired' }, { status: 410 })
  }

  return NextResponse.json(data.email_data)
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('microsoft_access_token')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ connected: !!profile?.microsoft_access_token })
}

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireOrgIdForRoute } from '@/lib/auth-helpers'

export async function GET() {
  const result = await requireOrgIdForRoute()
  if (result instanceof NextResponse) return result
  const { orgId } = result

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('organization_id', orgId)
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

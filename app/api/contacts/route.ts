import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { parseContactArrayFields } from '@/lib/validation'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) {
    return NextResponse.json({ error: 'No organisation found' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')
  const email = searchParams.get('email')

  // Search by email (for auto-matching from Outlook)
  if (email) {
    const normalizedEmail = email.toLowerCase().trim()
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', orgId)
      .or(`email.ilike.${normalizedEmail},normalized_email.ilike.${normalizedEmail}`)
      .limit(1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Parse JSONB fields
    const parsedData = (data || []).map(parseContactArrayFields)
    return NextResponse.json(parsedData)
  }

  // Search by business ID
  if (!businessId) {
    return NextResponse.json(
      { error: 'businessId or email is required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('business_id', businessId)
    .eq('organization_id', orgId)
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Parse JSONB fields
  const parsedData = (data || []).map(parseContactArrayFields)
  return NextResponse.json(parsedData)
}

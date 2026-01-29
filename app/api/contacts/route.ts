import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Helper to parse JSONB fields from Supabase
function parseContactArrayFields(contact: Record<string, unknown>) {
  return {
    ...contact,
    emails: typeof contact.emails === 'string'
      ? JSON.parse(contact.emails)
      : (Array.isArray(contact.emails) ? contact.emails : []),
    phones: typeof contact.phones === 'string'
      ? JSON.parse(contact.phones)
      : (Array.isArray(contact.phones) ? contact.phones : []),
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Parse JSONB fields
  const parsedData = (data || []).map(parseContactArrayFields)
  return NextResponse.json(parsedData)
}

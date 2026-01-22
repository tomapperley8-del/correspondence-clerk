import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * API route to update contact details (role, emails, phones)
 * Used by Feature #1: Inline contact editing
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { contactId, role, emails, phones } = body

    if (!contactId) {
      return NextResponse.json(
        { error: 'contactId is required' },
        { status: 400 }
      )
    }

    // Validate emails if provided
    if (emails && Array.isArray(emails)) {
      for (const email of emails) {
        if (email && (!email.includes('@') || !email.includes('.'))) {
          return NextResponse.json(
            { error: `Invalid email format: ${email}` },
            { status: 400 }
          )
        }
      }
    }

    // Update contact
    const updateData: any = {}

    if (role !== undefined) {
      updateData.role = role || null
    }

    if (emails !== undefined) {
      updateData.emails = emails.filter((e: string) => e.trim())
      // Backward compatibility: also set single email field
      updateData.email = emails[0] || null
      updateData.normalized_email = emails[0] ? emails[0].toLowerCase() : null
    }

    if (phones !== undefined) {
      updateData.phones = phones.filter((p: string) => p.trim())
      // Backward compatibility: also set single phone field
      updateData.phone = phones[0] || null
    }

    const { data, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
      .select()
      .single()

    if (error) {
      console.error('Error updating contact:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

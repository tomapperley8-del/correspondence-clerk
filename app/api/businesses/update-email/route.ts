import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * API route to update a business's email address
 * Used by Feature #1: Auto-add email to business
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
    const { businessId, email } = body

    if (!businessId || !email) {
      return NextResponse.json(
        { error: 'businessId and email are required' },
        { status: 400 }
      )
    }

    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Update business email
    const { data, error } = await supabase
      .from('businesses')
      .update({ email })
      .eq('id', businessId)
      .select()
      .single()

    if (error) {
      console.error('Error updating business email:', error)
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

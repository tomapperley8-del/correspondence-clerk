import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/import-email/retrieve/[token]
// Retrieves email data by token and deletes it (one-time use)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { token } = await params

    if (!token || token.length < 24) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 400 }
      )
    }

    // Retrieve email data
    const { data: tempData, error: selectError } = await supabase
      .from('temporary_email_data')
      .select('*')
      .eq('token', token)
      .eq('user_id', user.id) // RLS ensures this, but double-check
      .gt('expires_at', new Date().toISOString())
      .single()

    if (selectError || !tempData) {
      return NextResponse.json(
        { error: 'Token not found or expired' },
        { status: 404 }
      )
    }

    // Delete the token immediately (one-time use)
    const { error: deleteError } = await supabase
      .from('temporary_email_data')
      .delete()
      .eq('id', tempData.id)

    if (deleteError) {
      console.error('Error deleting temp email data:', deleteError)
      // Don't fail the request, just log
    }

    // Return the email data
    return NextResponse.json({
      success: true,
      emailData: tempData.email_data
    })

  } catch (error) {
    console.error('Error in retrieve endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

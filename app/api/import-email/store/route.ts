import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

// POST /api/import-email/store
// Stores email data temporarily and returns a token
export async function POST(request: NextRequest) {
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

    // Parse email data from request body
    const emailData = await request.json()

    // Validate required fields
    if (!emailData.emailSubject && !emailData.emailBody) {
      return NextResponse.json(
        { error: 'Email data must include subject or body' },
        { status: 400 }
      )
    }

    // Generate secure random token (48 chars hex)
    const token = crypto.randomBytes(24).toString('hex')

    // Store in temporary table
    const { data: tempData, error: insertError } = await supabase
      .from('temporary_email_data')
      .insert({
        user_id: user.id,
        token: token,
        email_data: emailData
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error storing temp email data:', insertError)
      return NextResponse.json(
        { error: 'Failed to store email data', details: insertError.message },
        { status: 500 }
      )
    }

    // Return token for retrieval
    return NextResponse.json({
      success: true,
      token: token,
      expiresIn: 3600 // 1 hour in seconds
    })

  } catch (error) {
    console.error('Error in store endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Enable CORS for bookmarklet
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

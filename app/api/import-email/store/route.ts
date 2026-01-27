import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

// Allowed origins for CORS (Outlook and Gmail domains)
const ALLOWED_ORIGINS = [
  'https://outlook.office.com',
  'https://outlook.office365.com',
  'https://outlook.live.com',
  'https://outlook-sdf.office.com',
  'https://mail.google.com',
]

// Helper to get CORS headers
function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

// POST /api/import-email/store
// Stores email data temporarily and returns a token
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      )
    }

    // Parse email data from request body
    const emailData = await request.json()

    // Validate required fields
    if (!emailData.emailSubject && !emailData.emailBody) {
      return NextResponse.json(
        { error: 'Email data must include subject or body' },
        { status: 400, headers: corsHeaders }
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
        { status: 500, headers: corsHeaders }
      )
    }

    // Return token for retrieval
    return NextResponse.json({
      success: true,
      token: token,
      expiresIn: 3600 // 1 hour in seconds
    }, { headers: corsHeaders })

  } catch (error) {
    console.error('Error in store endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Enable CORS for bookmarklet preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

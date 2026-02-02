import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Allowed origins for CORS (Outlook and Gmail only)
const ALLOWED_ORIGINS = [
  'https://outlook.office.com',
  'https://outlook.office365.com',
  'https://outlook.live.com',
  'https://mail.google.com',
]

// Organization domain for sent email detection (fallback if env not set)
const ORG_DOMAIN = process.env.ORGANIZATION_EMAIL_DOMAIN || 'chiswickcalendar.co.uk'

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin')
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

interface OutlookEmailData {
  subject: string
  body: string
  from: {
    name?: string
    email: string
  }
  to: Array<{
    name?: string
    email: string
  }>
  date: string // ISO 8601
  thread_id?: string
  raw_content: string
  business_id?: string
  contact_id?: string
}

/**
 * API endpoint to import email from Outlook
 * Accepts email data and either:
 * 1. Creates entry directly if business_id and contact_id provided
 * 2. Returns pre-fill URL for new-entry page
 */
export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      {
        status: 401,
        headers: corsHeaders,
      }
    )
  }

  try {
    const emailData: OutlookEmailData = await request.json()

    // Validate required fields
    if (!emailData.subject || !emailData.body || !emailData.from?.email) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, body, from' },
        { status: 400 }
      )
    }

    // Build raw content in format expected by AI formatter
    const fromStr = emailData.from.name
      ? `${emailData.from.name} <${emailData.from.email}>`
      : emailData.from.email
    const toStr = emailData.to
      .map((t) => (t.name ? `${t.name} <${t.email}>` : t.email))
      .join(', ')
    
    const rawContent = emailData.raw_content || `From: ${fromStr}
To: ${toStr}
Date: ${emailData.date}
Subject: ${emailData.subject}

${emailData.body}`

    // If business_id and contact_id provided, create entry directly
    if (emailData.business_id && emailData.contact_id) {
      // Verify business and contact exist and belong together
      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('id', emailData.business_id)
        .single()

      if (!business) {
        return NextResponse.json({ error: 'Business not found' }, { status: 404 })
      }

      const { data: contact } = await supabase
        .from('contacts')
        .select('id, business_id')
        .eq('id', emailData.contact_id)
        .single()

      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }

      if (contact.business_id !== emailData.business_id) {
        return NextResponse.json(
          { error: 'Contact does not belong to specified business' },
          { status: 400 }
        )
      }

      // Determine direction (sent vs received)
      const userEmail = user.email?.toLowerCase() || ''
      const fromEmail = emailData.from.email.toLowerCase()
      const direction: 'sent' | 'received' =
        fromEmail === userEmail || fromEmail.includes(ORG_DOMAIN)
          ? 'sent'
          : 'received'

      // Parse date
      const entryDate = emailData.date || new Date().toISOString()

      // Create correspondence entry (unformatted initially, will be formatted on save)
      const { data: entry, error: insertError } = await supabase
        .from('correspondence')
        .insert({
          business_id: emailData.business_id,
          contact_id: emailData.contact_id,
          user_id: user.id,
          raw_text_original: rawContent,
          formatted_text_original: null,
          formatted_text_current: null,
          entry_date: entryDate,
          subject: emailData.subject,
          type: 'Email',
          direction: direction,
          action_needed: 'none',
          formatting_status: 'unformatted',
          ai_metadata: {
            imported_from_outlook: true,
            imported_at: new Date().toISOString(),
          },
        })
        .select()
        .single()

      if (insertError) {
        return NextResponse.json(
          { error: `Failed to create entry: ${insertError.message}` },
          { status: 500 }
        )
      }

      // Update business last_contacted_at
      await supabase
        .from('businesses')
        .update({ last_contacted_at: entryDate })
        .eq('id', emailData.business_id)

      return NextResponse.json({
        success: true,
        entryId: entry.id,
        url: `/businesses/${emailData.business_id}?saved=${entry.id}`,
      }, {
        headers: corsHeaders,
      })
    }

    // Otherwise, return pre-fill URL
    const params = new URLSearchParams({
      emailSubject: emailData.subject,
      emailBody: emailData.body,
      emailFrom: fromStr,
      emailDate: emailData.date,
      emailTo: toStr,
      emailRawContent: encodeURIComponent(rawContent),
    })

    // Try to auto-match business/contact from email addresses
    let matchedBusinessId: string | null = null
    let matchedContactId: string | null = null

    // Search for contact by normalized email (query-side filter for performance)
    const fromEmail = emailData.from.email.toLowerCase()
    const { data: matchingContacts } = await supabase
      .from('contacts')
      .select('id, business_id')
      .eq('normalized_email', fromEmail)
      .limit(1)

    if (matchingContacts && matchingContacts.length > 0) {
      matchedBusinessId = matchingContacts[0].business_id
      matchedContactId = matchingContacts[0].id
    }

    if (matchedBusinessId) {
      params.append('businessId', matchedBusinessId)
    }
    if (matchedContactId) {
      params.append('contactId', matchedContactId)
    }

    const prefillUrl = `/new-entry?${params.toString()}`

    return NextResponse.json({
      success: true,
      prefillUrl,
      matched: {
        business_id: matchedBusinessId,
        contact_id: matchedContactId,
      },
    }, {
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Email import error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to import email',
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(request),
  })
}

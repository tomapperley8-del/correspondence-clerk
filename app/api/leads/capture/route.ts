/**
 * API route to capture leads from free tools, chatbot, etc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { enrollInSequence } from '@/lib/marketing/sequence-runner'

let supabaseClient: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseClient
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      email,
      name,
      company,
      source,
      industry,
      company_size,
      utm_source,
      utm_medium,
      utm_campaign,
    } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check for existing lead
    const { data: existingLead } = await getSupabase()
      .from('marketing_leads')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingLead) {
      // Update existing lead with new info if provided
      await getSupabase()
        .from('marketing_leads')
        .update({
          name: name || undefined,
          company: company || undefined,
          industry: industry || undefined,
          company_size: company_size || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id)

      return NextResponse.json({
        success: true,
        message: 'Lead updated',
        lead_id: existingLead.id,
      })
    }

    // Create new lead
    const { data: newLead, error: insertError } = await getSupabase()
      .from('marketing_leads')
      .insert({
        email: email.toLowerCase(),
        name: name || null,
        company: company || null,
        source: source || 'other',
        industry: industry || null,
        company_size: company_size || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        status: 'new',
        score: calculateLeadScore({ email, company, industry }),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error creating lead:', insertError)
      return NextResponse.json(
        { error: 'Failed to capture lead' },
        { status: 500 }
      )
    }

    // Enroll in nurture sequence
    await enrollInSequence(
      'lead_captured',
      email.toLowerCase(),
      undefined,
      undefined,
      { name, company, industry, source }
    )

    return NextResponse.json({
      success: true,
      message: 'Lead captured',
      lead_id: newLead.id,
    })
  } catch (error) {
    console.error('Lead capture error:', error)
    return NextResponse.json(
      { error: 'Failed to capture lead' },
      { status: 500 }
    )
  }
}

/**
 * Calculate initial lead score based on available data
 */
function calculateLeadScore(data: {
  email: string
  company?: string
  industry?: string
}): number {
  let score = 30 // Base score

  // Business email domain (+20)
  const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com']
  const domain = data.email.split('@')[1]?.toLowerCase()
  if (domain && !freeEmailDomains.includes(domain)) {
    score += 20
  }

  // Has company name (+10)
  if (data.company) {
    score += 10
  }

  // Has industry (+10)
  if (data.industry) {
    score += 10
  }

  // UK email domain hints (+10)
  if (domain?.endsWith('.co.uk') || domain?.endsWith('.uk')) {
    score += 10
  }

  return Math.min(score, 100)
}

export const dynamic = 'force-dynamic'

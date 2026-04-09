/**
 * Cron endpoint to send cold emails to prospects
 * Runs hourly to send personalized outreach via Smartlead
 */

import { NextRequest, NextResponse } from 'next/server'
import { getProspectsForOutreach, markProspectContacted } from '@/lib/marketing/prospect-db'
import { generateColdEmail, personalizeEmail } from '@/lib/marketing/email-generator'
import { addLeadToCampaign } from '@/lib/marketing/smartlead'

const CRON_SECRET = process.env.CRON_SECRET
const SMARTLEAD_CAMPAIGN_ID = parseInt(process.env.SMARTLEAD_CAMPAIGN_ID || '0')

// Daily send limit
const DAILY_LIMIT = 100
const HOURLY_LIMIT = Math.ceil(DAILY_LIMIT / 10) // Spread across business hours

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Check if within business hours (UK time)
  const now = new Date()
  const ukHour = parseInt(
    now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false })
  )

  if (ukHour < 9 || ukHour > 18) {
    return NextResponse.json({
      success: true,
      message: 'Outside business hours, skipping',
      timestamp: new Date().toISOString(),
    })
  }

  if (!SMARTLEAD_CAMPAIGN_ID) {
    return NextResponse.json({
      success: false,
      error: 'SMARTLEAD_CAMPAIGN_ID not configured',
    }, { status: 500 })
  }

  try {
    console.log('Starting cold email send...')
    const results = await sendColdEmails()
    console.log('Cold email results:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error sending cold emails:', error)
    return NextResponse.json(
      { error: 'Failed to send cold emails' },
      { status: 500 }
    )
  }
}

async function sendColdEmails(): Promise<{
  processed: number
  sent: number
  errors: number
}> {
  const stats = {
    processed: 0,
    sent: 0,
    errors: 0,
  }

  // Get prospects ready for outreach
  const prospects = await getProspectsForOutreach(70, HOURLY_LIMIT)

  if (prospects.length === 0) {
    console.log('No prospects ready for outreach')
    return stats
  }

  console.log(`Processing ${prospects.length} prospects`)

  for (const prospect of prospects) {
    stats.processed++

    if (!prospect.email) {
      console.log(`Skipping ${prospect.company_name} - no email`)
      continue
    }

    try {
      // Extract first name from email if possible
      const firstName = extractFirstName(prospect.email)

      // Generate personalized email
      const email = await generateColdEmail(prospect)
      const personalizedEmail = personalizeEmail(email, firstName)

      // Add to Smartlead campaign
      const result = await addLeadToCampaign(SMARTLEAD_CAMPAIGN_ID, {
        email: prospect.email,
        first_name: firstName,
        company_name: prospect.company_name,
        phone_number: prospect.phone || undefined,
        website: prospect.website || undefined,
        custom_fields: {
          industry: prospect.industry || '',
          subject: personalizedEmail.subject,
          email_body: personalizedEmail.body,
        },
      })

      if (result.success) {
        await markProspectContacted(prospect.id, result.leadId)
        stats.sent++
        console.log(`Added ${prospect.email} to campaign`)
      } else {
        stats.errors++
        console.error(`Failed to add ${prospect.email} to campaign`)
      }

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      stats.errors++
      console.error(`Error processing ${prospect.company_name}:`, error)
    }
  }

  return stats
}

/**
 * Try to extract first name from email address
 */
function extractFirstName(email: string): string | undefined {
  const localPart = email.split('@')[0]

  // Common patterns: john.smith, john_smith, johnsmith, john
  const patterns = [
    /^([a-z]+)\./i, // john.smith
    /^([a-z]+)_/i, // john_smith
    /^([a-z]{2,10})$/i, // john (2-10 chars, likely a name)
  ]

  for (const pattern of patterns) {
    const match = localPart.match(pattern)
    if (match) {
      const name = match[1]
      // Capitalize first letter
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    }
  }

  return undefined
}

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minute timeout

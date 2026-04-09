/**
 * Cron endpoint to discover and score new prospects
 * Runs daily at 2am to find UK businesses via Companies House + Google Places
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  searchBySicKeywords,
  TARGET_SIC_CODES,
  SicCode,
  formatAddress,
  getCompanyProfile,
} from '@/lib/marketing/companies-house'
import { enrichWithContactInfo } from '@/lib/marketing/google-places'
import { batchScoreProspects, getIndustryFromSicCodes } from '@/lib/marketing/prospect-scorer'
import { saveProspects, prospectExists } from '@/lib/marketing/prospect-db'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  // Verify cron secret
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('Starting prospect discovery...')
    const results = await discoverProspects()
    console.log('Prospect discovery results:', results)

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error discovering prospects:', error)
    return NextResponse.json(
      { error: 'Failed to discover prospects' },
      { status: 500 }
    )
  }
}

async function discoverProspects(): Promise<{
  searched: number
  newCompanies: number
  enriched: number
  scored: number
  saved: number
}> {
  const stats = {
    searched: 0,
    newCompanies: 0,
    enriched: 0,
    scored: 0,
    saved: 0,
  }

  // Rotate through SIC codes daily
  const today = new Date()
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  )
  const sicCodes = Object.keys(TARGET_SIC_CODES) as SicCode[]
  const todaysSicCode = sicCodes[dayOfYear % sicCodes.length]

  console.log(`Today's target SIC code: ${todaysSicCode} (${TARGET_SIC_CODES[todaysSicCode].name})`)

  // Search for companies
  const companies = await searchBySicKeywords(todaysSicCode, 30)
  stats.searched = companies.length
  console.log(`Found ${companies.length} companies`)

  // Filter out existing prospects
  const newCompanies = []
  for (const company of companies) {
    const exists = await prospectExists(company.company_number)
    if (!exists) {
      newCompanies.push(company)
    }
  }
  stats.newCompanies = newCompanies.length
  console.log(`${newCompanies.length} are new`)

  if (newCompanies.length === 0) {
    return stats
  }

  // Get full company profiles
  const prospects = []
  for (const company of newCompanies.slice(0, 20)) {
    // Limit to 20 per run
    const profile = await getCompanyProfile(company.company_number)
    if (!profile) continue

    const address = formatAddress(profile.registered_office_address)
    const industry = profile.sic_codes
      ? getIndustryFromSicCodes(profile.sic_codes)
      : TARGET_SIC_CODES[todaysSicCode].name

    // Enrich with contact info from Google Places
    const contactInfo = await enrichWithContactInfo(
      profile.company_name,
      address
    )
    stats.enriched++

    prospects.push({
      company_name: profile.company_name,
      company_number: profile.company_number,
      sic_codes: profile.sic_codes,
      address,
      phone: contactInfo?.phone,
      website: contactInfo?.website,
      industry,
    })

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  // Score prospects
  console.log(`Scoring ${prospects.length} prospects...`)
  const scoredProspects = await batchScoreProspects(prospects, 50, 10)
  stats.scored = scoredProspects.length

  // Save to database
  const saveResult = await saveProspects(scoredProspects)
  stats.saved = saveResult.saved

  console.log(`Saved ${saveResult.saved} prospects, skipped ${saveResult.skipped}`)

  return stats
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minute timeout for long discovery runs

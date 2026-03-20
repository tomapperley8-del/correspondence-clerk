/**
 * Companies House API client
 * Discovers UK businesses by SIC code for prospect targeting
 * API Documentation: https://developer.company-information.service.gov.uk/
 */

// Target SIC codes for Tier 1 ICP segments
// Tier 1: Freelance consultants, small agencies, independent accountants/bookkeepers
export const TARGET_SIC_CODES = {
  // Accountants & Bookkeepers (Tier 1)
  '69201': { name: 'Accounting services', segment: 'accountants', tier: 1 },
  '69202': { name: 'Bookkeeping', segment: 'accountants', tier: 1 },
  '69203': { name: 'Tax consultancy', segment: 'accountants', tier: 1 },

  // Management & Business Consultants (Tier 1)
  '70229': { name: 'Management consultancy', segment: 'consultants', tier: 1 },
  '70210': { name: 'Public relations', segment: 'consultants', tier: 1 },
  '70221': { name: 'Business consultancy', segment: 'consultants', tier: 1 },
  '78109': { name: 'HR consultancy', segment: 'consultants', tier: 1 },

  // Marketing & Creative Agencies (Tier 1)
  '73110': { name: 'Advertising agencies', segment: 'agencies', tier: 1 },
  '73120': { name: 'Media representation', segment: 'agencies', tier: 1 },
  '74100': { name: 'Design activities', segment: 'agencies', tier: 1 },
  '74901': { name: 'Environmental consultancy', segment: 'consultants', tier: 1 },
  '62020': { name: 'IT consultancy', segment: 'consultants', tier: 1 },
  '62090': { name: 'Other IT services', segment: 'consultants', tier: 1 },

  // Tier 2 - Property (target later)
  '68310': { name: 'Estate agents', segment: 'property', tier: 2 },
  '68320': { name: 'Property management', segment: 'property', tier: 2 },
} as const

export type SicCode = keyof typeof TARGET_SIC_CODES

export interface CompaniesHouseCompany {
  company_number: string
  title: string
  company_status: string
  company_type: string
  date_of_creation: string
  address: {
    address_line_1?: string
    address_line_2?: string
    locality?: string
    postal_code?: string
    region?: string
    country?: string
  }
  sic_codes?: string[]
}

export interface CompaniesHouseSearchResult {
  items: CompaniesHouseCompany[]
  total_results: number
  start_index: number
  items_per_page: number
}

export interface CompaniesHouseProfile {
  company_number: string
  company_name: string
  type: string
  registered_office_address: {
    address_line_1?: string
    address_line_2?: string
    locality?: string
    postal_code?: string
    region?: string
    country?: string
  }
  sic_codes?: string[]
  company_status: string
  date_of_creation: string
  accounts?: {
    last_accounts?: {
      made_up_to?: string
    }
  }
}

const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY
const API_BASE_URL = 'https://api.company-information.service.gov.uk'

/**
 * Search for companies by name
 */
export async function searchCompanies(
  query: string,
  itemsPerPage: number = 20,
  startIndex: number = 0
): Promise<CompaniesHouseSearchResult | null> {
  if (!COMPANIES_HOUSE_API_KEY) {
    console.error('COMPANIES_HOUSE_API_KEY not configured')
    return null
  }

  try {
    const params = new URLSearchParams({
      q: query,
      items_per_page: String(itemsPerPage),
      start_index: String(startIndex),
    })

    const response = await fetch(`${API_BASE_URL}/search/companies?${params}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`,
      },
    })

    if (!response.ok) {
      console.error(`Companies House API error: ${response.status}`)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Companies House search error:', error)
    return null
  }
}

/**
 * Get company profile by company number
 */
export async function getCompanyProfile(
  companyNumber: string
): Promise<CompaniesHouseProfile | null> {
  if (!COMPANIES_HOUSE_API_KEY) {
    console.error('COMPANIES_HOUSE_API_KEY not configured')
    return null
  }

  try {
    const response = await fetch(`${API_BASE_URL}/company/${companyNumber}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) return null
      console.error(`Companies House API error: ${response.status}`)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Companies House profile error:', error)
    return null
  }
}

/**
 * Search for companies by SIC code using advanced search
 * Note: Companies House doesn't support direct SIC code search via free API
 * We use keyword searches based on industry terms instead
 */
export async function searchBySicKeywords(
  sicCode: SicCode,
  limit: number = 50
): Promise<CompaniesHouseCompany[]> {
  const sicInfo = TARGET_SIC_CODES[sicCode]
  const searchTerms = getSearchTermsForSic(sicCode)
  const results: CompaniesHouseCompany[] = []

  for (const term of searchTerms) {
    if (results.length >= limit) break

    const searchResult = await searchCompanies(term, 20)
    if (!searchResult?.items) continue

    // Filter for active companies
    for (const company of searchResult.items) {
      if (results.length >= limit) break
      if (company.company_status !== 'active') continue
      if (!results.find((r) => r.company_number === company.company_number)) {
        results.push(company)
      }
    }

    // Rate limit: 600 requests per 5 minutes
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return results
}

/**
 * Get search terms for a SIC code
 */
function getSearchTermsForSic(sicCode: SicCode): string[] {
  const termMap: Record<SicCode, string[]> = {
    // Accountants & Bookkeepers
    '69201': ['accountants', 'accounting firm', 'chartered accountant'],
    '69202': ['bookkeeping', 'bookkeeper', 'payroll services'],
    '69203': ['tax advisor', 'tax consultant', 'tax services'],
    // Management & Business Consultants
    '70229': ['management consultant', 'business consultant', 'strategy consultant'],
    '70210': ['PR agency', 'public relations', 'PR consultant'],
    '70221': ['business advisor', 'business consultancy', 'advisory services'],
    '78109': ['HR consultant', 'HR services', 'recruitment consultant'],
    // Marketing & Creative Agencies
    '73110': ['advertising agency', 'ad agency', 'marketing agency'],
    '73120': ['media agency', 'media buying', 'media planning'],
    '74100': ['design agency', 'graphic design', 'branding agency'],
    '74901': ['environmental consultant', 'sustainability consultant', 'eco consultant'],
    '62020': ['IT consultant', 'technology consultant', 'digital consultant'],
    '62090': ['IT services', 'tech services', 'digital services'],
    // Property (Tier 2)
    '68310': ['estate agent', 'property agent', 'lettings'],
    '68320': ['property management', 'letting agent', 'landlord services'],
  }

  return termMap[sicCode] || []
}

/**
 * Batch fetch company profiles and enrich with contact info
 */
export async function enrichCompanyData(
  companies: CompaniesHouseCompany[]
): Promise<CompaniesHouseProfile[]> {
  const profiles: CompaniesHouseProfile[] = []

  for (const company of companies) {
    const profile = await getCompanyProfile(company.company_number)
    if (profile) {
      profiles.push(profile)
    }
    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return profiles
}

/**
 * Format address from Companies House format
 */
export function formatAddress(address: CompaniesHouseProfile['registered_office_address']): string {
  const parts = [
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.region,
    address.postal_code,
    address.country,
  ].filter(Boolean)

  return parts.join(', ')
}

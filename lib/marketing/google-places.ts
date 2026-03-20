/**
 * Google Places API client
 * Enriches prospect data with contact information
 * API Documentation: https://developers.google.com/maps/documentation/places/web-service
 */

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY
const API_BASE_URL = 'https://maps.googleapis.com/maps/api/place'

export interface PlaceSearchResult {
  place_id: string
  name: string
  formatted_address: string
  geometry: {
    location: {
      lat: number
      lng: number
    }
  }
  business_status?: string
  types?: string[]
}

export interface PlaceDetails {
  place_id: string
  name: string
  formatted_address: string
  formatted_phone_number?: string
  international_phone_number?: string
  website?: string
  opening_hours?: {
    open_now?: boolean
    weekday_text?: string[]
  }
  business_status?: string
  url?: string // Google Maps URL
}

export interface PlacesSearchResponse {
  results: PlaceSearchResult[]
  status: string
  next_page_token?: string
}

export interface PlaceDetailsResponse {
  result: PlaceDetails
  status: string
}

/**
 * Search for businesses by text query
 */
export async function searchPlaces(
  query: string,
  location?: string // e.g., "London, UK"
): Promise<PlaceSearchResult[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY not configured')
    return []
  }

  try {
    const params = new URLSearchParams({
      query: location ? `${query} in ${location}` : query,
      key: GOOGLE_PLACES_API_KEY,
    })

    const response = await fetch(
      `${API_BASE_URL}/textsearch/json?${params}`
    )

    if (!response.ok) {
      console.error(`Google Places API error: ${response.status}`)
      return []
    }

    const data: PlacesSearchResponse = await response.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`Google Places API status: ${data.status}`)
      return []
    }

    return data.results || []
  } catch (error) {
    console.error('Google Places search error:', error)
    return []
  }
}

/**
 * Get place details including contact information
 */
export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY not configured')
    return null
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,opening_hours,business_status,url',
      key: GOOGLE_PLACES_API_KEY,
    })

    const response = await fetch(
      `${API_BASE_URL}/details/json?${params}`
    )

    if (!response.ok) {
      console.error(`Google Places API error: ${response.status}`)
      return null
    }

    const data: PlaceDetailsResponse = await response.json()

    if (data.status !== 'OK') {
      console.error(`Google Places API status: ${data.status}`)
      return null
    }

    return data.result
  } catch (error) {
    console.error('Google Places details error:', error)
    return null
  }
}

/**
 * Search for businesses by industry type
 */
export async function searchByIndustry(
  industryType: string,
  region: string = 'UK'
): Promise<PlaceSearchResult[]> {
  const locations = getUkLocations()
  const allResults: PlaceSearchResult[] = []
  const seenPlaceIds = new Set<string>()

  for (const location of locations) {
    if (allResults.length >= 100) break

    const results = await searchPlaces(industryType, `${location}, ${region}`)

    for (const result of results) {
      if (!seenPlaceIds.has(result.place_id)) {
        seenPlaceIds.add(result.place_id)
        allResults.push(result)
      }
    }

    // Rate limit: stay under API quotas
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  return allResults
}

/**
 * Enrich a company with contact details from Google Places
 */
export async function enrichWithContactInfo(
  companyName: string,
  address?: string
): Promise<{
  phone?: string
  website?: string
  googleMapsUrl?: string
} | null> {
  const query = address ? `${companyName} ${address}` : companyName
  const searchResults = await searchPlaces(query)

  if (!searchResults.length) return null

  // Get details for the first (most relevant) result
  const details = await getPlaceDetails(searchResults[0].place_id)

  if (!details) return null

  return {
    phone: details.formatted_phone_number || details.international_phone_number,
    website: details.website,
    googleMapsUrl: details.url,
  }
}

/**
 * Major UK cities/regions for searching
 */
function getUkLocations(): string[] {
  return [
    'London',
    'Manchester',
    'Birmingham',
    'Leeds',
    'Liverpool',
    'Sheffield',
    'Bristol',
    'Newcastle',
    'Edinburgh',
    'Glasgow',
    'Cardiff',
    'Belfast',
    'Nottingham',
    'Southampton',
    'Leicester',
    'Portsmouth',
    'Brighton',
    'Reading',
    'Oxford',
    'Cambridge',
  ]
}

/**
 * Batch enrich multiple companies
 */
export async function batchEnrichContacts(
  companies: Array<{ name: string; address?: string }>
): Promise<
  Array<{
    name: string
    phone?: string
    website?: string
    googleMapsUrl?: string
  }>
> {
  const results = []

  for (const company of companies) {
    const enriched = await enrichWithContactInfo(company.name, company.address)

    results.push({
      name: company.name,
      ...enriched,
    })

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  return results
}

/**
 * Smartlead API client for cold email automation
 * API Documentation: https://api.smartlead.ai/reference
 */

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY
const API_BASE_URL = 'https://server.smartlead.ai/api/v1'

export interface SmartleadLead {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  phone_number?: string
  website?: string
  custom_fields?: Record<string, string>
}

export interface SmartleadCampaign {
  id: number
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  created_at: string
}

export interface SmartleadCampaignStats {
  campaign_id: number
  leads_count: number
  sent_count: number
  opened_count: number
  clicked_count: number
  replied_count: number
  bounced_count: number
}

/**
 * Make an API request to Smartlead
 */
async function smartleadRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<T | null> {
  if (!SMARTLEAD_API_KEY) {
    console.error('SMARTLEAD_API_KEY not configured')
    return null
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}?api_key=${SMARTLEAD_API_KEY}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Smartlead API error: ${response.status} - ${errorText}`)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Smartlead API error:', error)
    return null
  }
}

/**
 * Get all campaigns
 */
export async function getCampaigns(): Promise<SmartleadCampaign[]> {
  const response = await smartleadRequest<{ campaigns: SmartleadCampaign[] }>(
    '/campaigns'
  )
  return response?.campaigns || []
}

/**
 * Get campaign by ID
 */
export async function getCampaign(
  campaignId: number
): Promise<SmartleadCampaign | null> {
  return smartleadRequest<SmartleadCampaign>(`/campaigns/${campaignId}`)
}

/**
 * Get campaign statistics
 */
export async function getCampaignStats(
  campaignId: number
): Promise<SmartleadCampaignStats | null> {
  return smartleadRequest<SmartleadCampaignStats>(
    `/campaigns/${campaignId}/analytics`
  )
}

/**
 * Add leads to a campaign
 */
export async function addLeadsToCampaign(
  campaignId: number,
  leads: SmartleadLead[]
): Promise<{ success: boolean; added: number }> {
  const response = await smartleadRequest<{ message: string; count: number }>(
    `/campaigns/${campaignId}/leads`,
    'POST',
    { lead_list: leads }
  )

  if (!response) {
    return { success: false, added: 0 }
  }

  return { success: true, added: response.count || leads.length }
}

/**
 * Add a single lead to a campaign
 */
export async function addLeadToCampaign(
  campaignId: number,
  lead: SmartleadLead
): Promise<{ success: boolean; leadId?: string }> {
  const response = await smartleadRequest<{ id: string }>(
    `/campaigns/${campaignId}/leads`,
    'POST',
    { lead_list: [lead] }
  )

  if (!response) {
    return { success: false }
  }

  return { success: true, leadId: response.id }
}

/**
 * Get leads from a campaign
 */
export async function getCampaignLeads(
  campaignId: number,
  limit: number = 100,
  offset: number = 0
): Promise<SmartleadLead[]> {
  const response = await smartleadRequest<{ leads: SmartleadLead[] }>(
    `/campaigns/${campaignId}/leads?limit=${limit}&offset=${offset}`
  )
  return response?.leads || []
}

/**
 * Create a new campaign
 */
export async function createCampaign(
  name: string,
  settings?: {
    from_email?: string
    from_name?: string
    reply_to?: string
    daily_limit?: number
    sending_schedule?: string
  }
): Promise<SmartleadCampaign | null> {
  return smartleadRequest<SmartleadCampaign>('/campaigns', 'POST', {
    name,
    ...settings,
  })
}

/**
 * Add email sequence to a campaign
 */
export async function addEmailSequence(
  campaignId: number,
  sequence: Array<{
    subject: string
    body: string
    delay_days: number
  }>
): Promise<boolean> {
  const response = await smartleadRequest(
    `/campaigns/${campaignId}/sequences`,
    'POST',
    { sequences: sequence }
  )

  return !!response
}

/**
 * Pause a campaign
 */
export async function pauseCampaign(campaignId: number): Promise<boolean> {
  const response = await smartleadRequest(
    `/campaigns/${campaignId}/status`,
    'PUT',
    { status: 'PAUSED' }
  )
  return !!response
}

/**
 * Resume a campaign
 */
export async function resumeCampaign(campaignId: number): Promise<boolean> {
  const response = await smartleadRequest(
    `/campaigns/${campaignId}/status`,
    'PUT',
    { status: 'ACTIVE' }
  )
  return !!response
}

/**
 * Get email account health
 */
export async function getEmailAccountHealth(): Promise<{
  accounts: Array<{
    email: string
    health_score: number
    daily_limit: number
    sent_today: number
  }>
} | null> {
  return smartleadRequest('/email-accounts')
}

/**
 * Get lead status in a campaign
 */
export async function getLeadStatus(
  campaignId: number,
  email: string
): Promise<{
  status: 'ACTIVE' | 'REPLIED' | 'BOUNCED' | 'UNSUBSCRIBED' | 'COMPLETED'
  sent_count: number
  opened: boolean
  clicked: boolean
  replied: boolean
} | null> {
  return smartleadRequest(
    `/campaigns/${campaignId}/leads/${encodeURIComponent(email)}`
  )
}

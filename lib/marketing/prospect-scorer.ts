/**
 * AI-powered prospect scoring
 * Scores leads from 0-100 based on fit for Correspondence Clerk
 */

import Anthropic from '@anthropic-ai/sdk'
import { TARGET_SIC_CODES, SicCode } from './companies-house'

const anthropic = new Anthropic()

export interface ProspectData {
  company_name: string
  company_number?: string
  sic_codes?: string[]
  address?: string
  website?: string
  phone?: string
  email?: string
  employee_count?: string
  industry?: string
}

export interface ScoredProspect extends ProspectData {
  score: number
  score_reasons: string[]
  recommended_action: 'contact' | 'nurture' | 'skip'
}

/**
 * Score a prospect using Claude AI
 */
export async function scoreProspect(prospect: ProspectData): Promise<ScoredProspect> {
  // Quick scoring based on heuristics for speed (no API call)
  const quickScore = calculateQuickScore(prospect)

  // If quick score is below threshold, don't waste API calls
  if (quickScore < 30) {
    return {
      ...prospect,
      score: quickScore,
      score_reasons: ['Low initial fit based on industry/size'],
      recommended_action: 'skip',
    }
  }

  // For promising prospects, use AI for detailed scoring
  try {
    const aiScore = await getAiScore(prospect)
    return aiScore
  } catch (error) {
    console.error('AI scoring error:', error)
    // Fallback to quick score
    return {
      ...prospect,
      score: quickScore,
      score_reasons: ['Scored using heuristics (AI unavailable)'],
      recommended_action: quickScore >= 70 ? 'contact' : quickScore >= 50 ? 'nurture' : 'skip',
    }
  }
}

/**
 * Calculate a quick score based on heuristics
 */
function calculateQuickScore(prospect: ProspectData): number {
  let score = 50 // Base score

  // SIC code match (+20)
  if (prospect.sic_codes?.length) {
    const hasTargetSic = prospect.sic_codes.some(
      (code) => code in TARGET_SIC_CODES
    )
    if (hasTargetSic) score += 20
  }

  // Has website (+10)
  if (prospect.website) score += 10

  // Has phone (+5)
  if (prospect.phone) score += 5

  // Has email (+10)
  if (prospect.email) score += 10

  // Company size indicators
  if (prospect.employee_count) {
    const count = prospect.employee_count.toLowerCase()
    if (count.includes('10-50') || count.includes('11-50')) {
      score += 15 // Sweet spot
    } else if (count.includes('50-') || count.includes('51-')) {
      score += 10
    } else if (count.includes('1-10') || count.includes('2-10')) {
      score += 5
    }
  }

  // Industry keyword match
  const name = prospect.company_name.toLowerCase()
  const industryKeywords = [
    'solicitor', 'law', 'legal',
    'estate agent', 'lettings', 'property',
    'accountant', 'accounting',
    'magazine', 'publishing',
    'association', 'institute',
    'council', 'parish',
  ]

  for (const keyword of industryKeywords) {
    if (name.includes(keyword)) {
      score += 10
      break
    }
  }

  // Cap at 100
  return Math.min(score, 100)
}

/**
 * Get detailed AI scoring
 */
async function getAiScore(prospect: ProspectData): Promise<ScoredProspect> {
  const prompt = `You are a sales intelligence AI scoring leads for Correspondence Clerk, a SaaS tool that helps businesses organise and search their correspondence (letters, emails, contracts).

IDEAL CUSTOMER PROFILE:
- Small to medium businesses (5-50 employees)
- Industries with heavy correspondence: law firms, estate agents, accountants, publishers, associations
- UK-based
- Already have some digital presence (website)

PROSPECT TO SCORE:
${JSON.stringify(prospect, null, 2)}

Score this prospect from 0-100 and explain why. Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "score_reasons": ["reason 1", "reason 2", "reason 3"],
  "recommended_action": "contact" | "nurture" | "skip"
}

Scoring guide:
- 80-100: Excellent fit, contact immediately
- 60-79: Good fit, add to nurture sequence
- 40-59: Moderate fit, low priority
- 0-39: Poor fit, skip`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type')
  }

  try {
    const result = JSON.parse(content.text)
    return {
      ...prospect,
      score: result.score,
      score_reasons: result.score_reasons,
      recommended_action: result.recommended_action,
    }
  } catch {
    console.error('Failed to parse AI score response:', content.text)
    throw new Error('Invalid AI response')
  }
}

/**
 * Batch score multiple prospects
 * Uses quick scoring for initial filter, AI for top candidates
 */
export async function batchScoreProspects(
  prospects: ProspectData[],
  aiScoringThreshold: number = 50,
  maxAiCalls: number = 20
): Promise<ScoredProspect[]> {
  const results: ScoredProspect[] = []
  let aiCallCount = 0

  for (const prospect of prospects) {
    const quickScore = calculateQuickScore(prospect)

    // Use AI scoring for promising prospects
    if (quickScore >= aiScoringThreshold && aiCallCount < maxAiCalls) {
      const scored = await scoreProspect(prospect)
      results.push(scored)
      aiCallCount++
      // Rate limit AI calls
      await new Promise((resolve) => setTimeout(resolve, 100))
    } else {
      // Quick score only
      results.push({
        ...prospect,
        score: quickScore,
        score_reasons: ['Scored using heuristics'],
        recommended_action:
          quickScore >= 70 ? 'contact' : quickScore >= 50 ? 'nurture' : 'skip',
      })
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score)
}

/**
 * Get industry from SIC codes
 */
export function getIndustryFromSicCodes(sicCodes: string[]): string | undefined {
  for (const code of sicCodes) {
    if (code in TARGET_SIC_CODES) {
      return TARGET_SIC_CODES[code as SicCode].name
    }
  }
  return undefined
}

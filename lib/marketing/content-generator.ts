/**
 * AI-powered content generator for social media
 * Creates daily posts for LinkedIn and Twitter
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export type ContentType = 'tip' | 'feature' | 'story' | 'news' | 'promo'
export type Platform = 'linkedin' | 'twitter' | 'both'

export interface GeneratedContent {
  content: string
  content_type: ContentType
  platform: Platform
  hashtags: string[]
}

// Content calendar - what type of content for each day
const CONTENT_CALENDAR: Record<number, { type: ContentType; platform: Platform }> = {
  1: { type: 'tip', platform: 'linkedin' }, // Monday
  2: { type: 'feature', platform: 'twitter' }, // Tuesday
  3: { type: 'story', platform: 'linkedin' }, // Wednesday
  4: { type: 'news', platform: 'twitter' }, // Thursday
  5: { type: 'tip', platform: 'both' }, // Friday
  6: { type: 'promo', platform: 'both' }, // Saturday (light promo)
  0: { type: 'tip', platform: 'both' }, // Sunday
}

// Content themes to rotate through
const CONTENT_THEMES = {
  tip: [
    'Email organisation',
    'Filing best practices',
    'Correspondence tracking',
    'Professional communication',
    'Document management',
    'Client relationship management',
    'Time management with correspondence',
    'Legal compliance and record-keeping',
  ],
  feature: [
    'AI-powered formatting',
    'Email import from Outlook/Gmail',
    'Full-text search',
    'Contact management',
    'Export to Google Docs',
    'Thread detection',
    'Business filing system',
    'Duplicate detection',
  ],
  story: [
    'How a solicitor saved 5 hours per week',
    'Estate agent transformed their workflow',
    'Accountant never loses a letter again',
    'Magazine publisher organises advertiser correspondence',
    'Trade association manages member communications',
  ],
  news: [
    'Data protection and correspondence',
    'Digital transformation in small businesses',
    'Professional standards for record-keeping',
    'Industry trends in document management',
  ],
  promo: [
    'Free trial announcement',
    'Feature highlight',
    'Customer success story',
  ],
}

/**
 * Generate content for today
 */
export async function generateTodaysContent(): Promise<GeneratedContent> {
  const dayOfWeek = new Date().getDay()
  const config = CONTENT_CALENDAR[dayOfWeek]

  return generateContent(config.type, config.platform)
}

/**
 * Generate content for a specific type and platform
 */
export async function generateContent(
  contentType: ContentType,
  platform: Platform
): Promise<GeneratedContent> {
  const themes = CONTENT_THEMES[contentType]
  const theme = themes[Math.floor(Math.random() * themes.length)]

  const platformGuidelines = getPlatformGuidelines(platform)
  const contentTypeGuidelines = getContentTypeGuidelines(contentType)

  const prompt = `You are a social media manager for Correspondence Clerk, a UK SaaS tool that helps businesses organise their correspondence (letters, emails, contracts).

CONTENT TYPE: ${contentType}
THEME: ${theme}
PLATFORM: ${platform}

PLATFORM GUIDELINES:
${platformGuidelines}

CONTENT TYPE GUIDELINES:
${contentTypeGuidelines}

BRAND VOICE:
- Professional but approachable
- British English spelling
- No hype or exaggeration
- Practical and helpful
- Understated humour welcome

Write ONE ${platform === 'both' ? 'LinkedIn' : platform} post about "${theme}".

Return ONLY valid JSON:
{
  "content": "The post text",
  "hashtags": ["relevant", "hashtags", "max4"]
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const response = message.content[0]
    if (response.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    const result = JSON.parse(response.text)

    return {
      content: result.content,
      content_type: contentType,
      platform,
      hashtags: result.hashtags || [],
    }
  } catch (error) {
    console.error('Content generation error:', error)
    return getFallbackContent(contentType, platform)
  }
}

/**
 * Generate a week's worth of content
 */
export async function generateWeeklyContent(): Promise<GeneratedContent[]> {
  const content: GeneratedContent[] = []

  for (let day = 0; day < 7; day++) {
    const config = CONTENT_CALENDAR[day]
    const generated = await generateContent(config.type, config.platform)
    content.push(generated)

    // Rate limit AI calls
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  return content
}

function getPlatformGuidelines(platform: Platform): string {
  const guidelines: Record<Platform, string> = {
    linkedin: `
- Maximum 3000 characters (aim for 500-1000)
- Professional tone
- Can include line breaks for readability
- Hook in first line (visible before "see more")
- End with call to action or question
- Use 3-4 relevant hashtags at the end`,
    twitter: `
- Maximum 280 characters
- Punchy and concise
- One key point per tweet
- Use 1-2 hashtags integrated naturally
- Can use emojis sparingly
- Thread format if needed (but prefer single tweet)`,
    both: `
- Keep under 280 characters to work on both
- Professional but accessible
- One clear message
- 1-2 hashtags`,
  }

  return guidelines[platform]
}

function getContentTypeGuidelines(contentType: ContentType): string {
  const guidelines: Record<ContentType, string> = {
    tip: `
- Share actionable advice
- Make it immediately useful
- No sales pitch
- Educational tone`,
    feature: `
- Highlight ONE feature
- Explain the benefit, not just what it does
- Use case example if possible
- Subtle - don't be salesy`,
    story: `
- Brief customer success story format
- "Before/after" structure works well
- Keep specific but anonymous if needed
- Focus on outcome and benefit`,
    news: `
- Comment on relevant industry news
- Add your perspective
- Connect to correspondence management if natural
- Be thought-provoking`,
    promo: `
- Light promotional content
- Focus on value proposition
- Include call to action
- Weekend = softer sell`,
  }

  return guidelines[contentType]
}

function getFallbackContent(
  contentType: ContentType,
  platform: Platform
): GeneratedContent {
  const fallbacks: Record<ContentType, string> = {
    tip: 'Quick tip: Create a folder for each business you correspond with. When a letter arrives, file it immediately. Future you will thank present you.',
    feature: 'Ever lose an important email in your inbox? Correspondence Clerk lets you import directly from Outlook or Gmail with one click. Everything searchable, nothing lost.',
    story: 'One of our users told us they used to spend 20 minutes finding letters. Now it takes 10 seconds. That\'s 15+ hours saved per month on just searching.',
    news: 'Digital correspondence is increasing, but many businesses still struggle to organise it. The tools we use for email weren\'t designed for record-keeping.',
    promo: 'Correspondence Clerk: One searchable archive for all your business letters, emails, and contracts. 14-day free trial, no card required.',
  }

  return {
    content: fallbacks[contentType],
    content_type: contentType,
    platform,
    hashtags: ['CorrespondenceClerk', 'BusinessOrganisation'],
  }
}

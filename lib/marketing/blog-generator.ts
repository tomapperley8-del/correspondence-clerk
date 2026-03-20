/**
 * AI-powered blog content generator
 * Creates SEO-optimized blog posts automatically
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()

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

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  content: string
  metaDescription: string
  metaKeywords: string[]
  industry?: string
}

// Blog topic templates
const BLOG_TOPICS = [
  {
    template: 'How {industry} can organise correspondence better',
    industries: ['solicitors', 'estate agents', 'accountants', 'publishers'],
    keywords: ['correspondence', 'organisation', 'filing'],
  },
  {
    template: 'Letter filing best practices for {industry}',
    industries: ['small businesses', 'professional services', 'legal firms'],
    keywords: ['filing', 'best practices', 'document management'],
  },
  {
    template: 'Email management tips for busy {industry}',
    industries: ['professionals', 'business owners', 'office managers'],
    keywords: ['email', 'management', 'productivity'],
  },
  {
    template: 'Why {industry} need a correspondence archive',
    industries: ['law firms', 'accountancy practices', 'letting agents'],
    keywords: ['archive', 'compliance', 'record keeping'],
  },
  {
    template: 'The hidden cost of disorganised correspondence in {industry}',
    industries: ['professional services', 'small businesses', 'agencies'],
    keywords: ['productivity', 'time management', 'efficiency'],
  },
  {
    template: 'Digital transformation in {industry}: Starting with correspondence',
    industries: ['traditional businesses', 'SMEs', 'professional firms'],
    keywords: ['digital transformation', 'modernisation', 'technology'],
  },
  {
    template: 'How to never lose an important letter again',
    industries: [],
    keywords: ['organisation', 'filing', 'document management'],
  },
  {
    template: 'The complete guide to business correspondence management',
    industries: [],
    keywords: ['guide', 'correspondence', 'management'],
  },
  {
    template: 'Client correspondence: Building better relationships through organisation',
    industries: [],
    keywords: ['client relationships', 'communication', 'organisation'],
  },
  {
    template: 'GDPR and correspondence: What UK businesses need to know',
    industries: [],
    keywords: ['GDPR', 'compliance', 'data protection'],
  },
]

/**
 * Generate a blog post
 */
export async function generateBlogPost(
  topic?: string,
  industry?: string
): Promise<BlogPost | null> {
  // Select a random topic if not provided
  const selectedTopic = topic || selectRandomTopic(industry)

  const prompt = `You are writing a blog post for Correspondence Clerk, a UK SaaS tool that helps businesses organise their correspondence (letters, emails, contracts).

TOPIC: ${selectedTopic}
${industry ? `TARGET INDUSTRY: ${industry}` : ''}

GUIDELINES:
- Write in British English
- Professional but accessible tone
- 800-1200 words
- Include practical advice
- Mention Correspondence Clerk naturally (not too salesy)
- Add a clear call-to-action at the end
- Structure with H2 and H3 headings
- Include a compelling introduction

Return ONLY valid JSON:
{
  "title": "SEO-optimized title (under 60 chars)",
  "excerpt": "Compelling excerpt (under 160 chars)",
  "content": "Full blog post in markdown format",
  "metaDescription": "SEO meta description (under 160 chars)",
  "metaKeywords": ["keyword1", "keyword2", "keyword3"]
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    const result = JSON.parse(content.text)

    // Generate slug from title
    const slug = generateSlug(result.title)

    return {
      slug,
      title: result.title,
      excerpt: result.excerpt,
      content: result.content,
      metaDescription: result.metaDescription,
      metaKeywords: result.metaKeywords,
      industry,
    }
  } catch (error) {
    console.error('Blog generation error:', error)
    return null
  }
}

/**
 * Save blog post to database
 */
export async function saveBlogPost(
  post: BlogPost,
  publish: boolean = false
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('blog_posts')
    .insert({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      meta_description: post.metaDescription,
      meta_keywords: post.metaKeywords,
      industry: post.industry,
      status: publish ? 'published' : 'draft',
      published_at: publish ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error saving blog post:', error)
    return null
  }

  return data.id
}

/**
 * Get published blog posts
 */
export async function getPublishedPosts(
  limit: number = 10,
  offset: number = 0
): Promise<Array<{
  slug: string
  title: string
  excerpt: string
  published_at: string
  industry: string | null
}>> {
  const { data, error } = await getSupabase()
    .from('blog_posts')
    .select('slug, title, excerpt, published_at, industry')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching blog posts:', error)
    return []
  }

  return data || []
}

/**
 * Get a single blog post by slug
 */
export async function getPostBySlug(slug: string): Promise<{
  slug: string
  title: string
  content: string
  excerpt: string
  meta_description: string
  meta_keywords: string[]
  published_at: string
  industry: string | null
} | null> {
  const { data, error } = await getSupabase()
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error) {
    return null
  }

  return data
}

/**
 * Generate weekly blog content (for cron)
 */
export async function generateWeeklyBlogPost(): Promise<{
  generated: boolean
  postId?: string
  error?: string
}> {
  // Get recent posts to avoid duplicate topics
  const recentPosts = await getPublishedPosts(10)
  const recentTitles = recentPosts.map((p) => p.title.toLowerCase())

  // Try to generate a unique post
  let attempts = 0
  while (attempts < 3) {
    const post = await generateBlogPost()
    if (!post) {
      attempts++
      continue
    }

    // Check for similar titles
    const isDuplicate = recentTitles.some(
      (title) =>
        title.includes(post.title.toLowerCase().slice(0, 20)) ||
        post.title.toLowerCase().includes(title.slice(0, 20))
    )

    if (isDuplicate) {
      attempts++
      continue
    }

    // Save and publish
    const postId = await saveBlogPost(post, true)
    if (postId) {
      return { generated: true, postId }
    }

    attempts++
  }

  return { generated: false, error: 'Failed to generate unique post' }
}

/**
 * Select a random topic
 */
function selectRandomTopic(preferredIndustry?: string): string {
  const eligibleTopics = preferredIndustry
    ? BLOG_TOPICS.filter(
        (t) =>
          t.industries.length === 0 ||
          t.industries.some((i) =>
            i.toLowerCase().includes(preferredIndustry.toLowerCase())
          )
      )
    : BLOG_TOPICS

  const topic = eligibleTopics[Math.floor(Math.random() * eligibleTopics.length)]
  const industry =
    topic.industries.length > 0
      ? topic.industries[Math.floor(Math.random() * topic.industries.length)]
      : 'businesses'

  return topic.template.replace('{industry}', industry)
}

/**
 * Generate URL-friendly slug
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

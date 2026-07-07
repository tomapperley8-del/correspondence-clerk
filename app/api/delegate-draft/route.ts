import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'

export const maxDuration = 60

const SYSTEM_PROMPT = `You are drafting an outreach email for The Chiswick Calendar, a community news website covering Chiswick and west London with 17,500+ newsletter subscribers (~50% open rate) and 43,000+ monthly website visitors.

The email is from Tom at The Chiswick Calendar. Send address: info@thechiswickcalendar.co.uk

About the products you might be pitching:
- Club Card: £250/year membership for local businesses. Includes a listing page on the website, editorial coverage, promotional benefits, and a Club Card badge.
- Display advertising: leaderboard banners, sidebar ads, newsletter sponsorship — available at various price points.
- Featured articles and advertorials also available.

You will be given: the business record, their full correspondence history with The Chiswick Calendar, the task that triggered this draft, and any known contacts.

Rules — follow these exactly:
1. Maximum 150 words for the email body. Be concise.
2. Warm, friendly, professional tone. Not corporate, not salesy, not over-familiar.
3. If there is correspondence history, reference it specifically to show continuity: "When we last spoke in March..." or "Thanks for being a Club Card member this past year..."
4. If this is a renewal, focus on the value they have received and make it easy to say yes.
5. If this is cold outreach to a business with no history, keep it short. Lead with something specific about their business. Suggest a quick call or coffee.
6. If the business has been contacted before but gone quiet, acknowledge the gap without being passive-aggressive.
7. Sign off as: Tom / The Chiswick Calendar
8. Include exactly one clear call to action.
9. Do NOT use em dashes. Use commas, full stops, or semicolons instead.
10. Do NOT use any of these words: thrilled, delighted, excited, vibrant, bustling, nestled, hub, community-minded, heartbeat.
11. Output format: first line is the subject line, then a blank line, then the email body. Nothing else. No preamble, no explanation, no "Here's a draft..." prefix.`

const MAX_HISTORY_ENTRIES = 60
const MAX_ENTRY_CHARS = 600

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getCurrentUserOrganizationId()
  if (!orgId) return NextResponse.json({ error: 'No organisation found' }, { status: 401 })

  let taskId: string | undefined
  try {
    const body = await request.json()
    taskId = body?.taskId
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  // Task details
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, notes, due_date, category, source, business_id')
    .eq('id', taskId)
    .eq('organization_id', orgId)
    .single()

  if (taskError || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (!task.business_id) {
    return NextResponse.json({ error: 'Link a business to this task first' }, { status: 400 })
  }

  // Business record
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id, name, status, category, is_club_card, is_advertiser, membership_type, deal_terms, contract_start, contract_end, notes, relationship_memory')
    .eq('id', task.business_id)
    .eq('organization_id', orgId)
    .single()

  if (bizError || !business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Full correspondence history, newest first
  const { data: history } = await supabase
    .from('correspondence')
    .select('entry_date, type, direction, subject, formatted_text_current, raw_text_original')
    .eq('business_id', business.id)
    .order('entry_date', { ascending: false })
    .limit(MAX_HISTORY_ENTRIES)

  // Known contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('name, role, emails')
    .eq('business_id', business.id)
    .eq('is_active', true)

  const businessBlock = [
    `Name: ${business.name}`,
    business.status ? `Status: ${business.status}` : null,
    business.category ? `Category: ${business.category}` : null,
    `Club Card member: ${business.is_club_card ? 'yes' : 'no'}`,
    `Advertiser: ${business.is_advertiser ? 'yes' : 'no'}`,
    business.membership_type ? `Membership type: ${business.membership_type}` : null,
    business.deal_terms ? `Deal terms: ${business.deal_terms}` : null,
    business.contract_start ? `Contract start: ${business.contract_start}` : null,
    business.contract_end ? `Contract end: ${business.contract_end}` : null,
    business.relationship_memory ? `Relationship summary: ${business.relationship_memory}` : null,
    business.notes ? `Notes: ${business.notes}` : null,
  ].filter(Boolean).join('\n')

  const contactsBlock = contacts?.length
    ? contacts
        .map(c => {
          const emails = Array.isArray(c.emails) ? (c.emails as string[]).join(', ') : ''
          return `- ${c.name}${c.role ? ` (${c.role})` : ''}${emails ? ` — ${emails}` : ''}`
        })
        .join('\n')
    : 'No named contacts on file.'

  const historyBlock = history?.length
    ? history
        .map(h => {
          const text = (h.formatted_text_current || h.raw_text_original || '').slice(0, MAX_ENTRY_CHARS)
          const date = h.entry_date ? h.entry_date.split('T')[0] : 'undated'
          return `[${date} · ${h.type ?? 'Entry'}${h.direction ? ` · ${h.direction}` : ''}]${h.subject ? ` ${h.subject}` : ''}\n${text}`
        })
        .join('\n\n---\n\n')
    : 'No correspondence history — this is cold outreach.'

  const taskBlock = [
    `Title: ${task.title}`,
    task.due_date ? `Due: ${task.due_date}` : null,
    task.category ? `Category: ${task.category}` : null,
    task.source ? `Source: ${task.source}` : null,
    task.notes ? `Notes: ${task.notes}` : null,
  ].filter(Boolean).join('\n')

  const userMessage = `TASK THAT TRIGGERED THIS DRAFT:
${taskBlock}

BUSINESS RECORD:
${businessBlock}

KNOWN CONTACTS:
${contactsBlock}

CORRESPONDENCE HISTORY (newest first):
${historyBlock}`

  let responseText = ''
  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: AI_MODELS.PREMIUM,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
    responseText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch (err) {
    console.error('delegate-draft AI error:', err)
    return NextResponse.json({ error: 'AI unavailable — please try again' }, { status: 502 })
  }

  if (!responseText) {
    return NextResponse.json({ error: 'AI returned an empty draft' }, { status: 502 })
  }

  // First line = subject, blank line, then body
  const newlineIndex = responseText.indexOf('\n')
  const subject = (newlineIndex === -1 ? responseText : responseText.slice(0, newlineIndex))
    .replace(/^subject:\s*/i, '')
    .trim()
  const emailBody = newlineIndex === -1 ? '' : responseText.slice(newlineIndex + 1).trim()

  if (!subject || !emailBody) {
    return NextResponse.json({ error: 'AI returned an unexpected format — please retry' }, { status: 502 })
  }

  const { data: entry, error: insertError } = await supabase
    .from('correspondence')
    .insert({
      organization_id: orgId,
      business_id: business.id,
      contact_id: null,
      user_id: user.id,
      raw_text_original: responseText,
      formatted_text_original: emailBody,
      formatted_text_current: emailBody,
      entry_date: new Date().toISOString(),
      subject,
      type: 'Draft',
      direction: 'outbound',
      action_needed: 'follow_up',
      formatting_status: 'formatted',
      ai_metadata: {
        source: 'delegate_draft',
        task_id: task.id,
        task_title: task.title,
        draft_status: 'draft',
      },
    })
    .select('id')
    .single()

  if (insertError || !entry) {
    console.error('delegate-draft insert error:', insertError)
    return NextResponse.json({ error: 'Draft generated but could not be saved — please retry' }, { status: 500 })
  }

  return NextResponse.json({ correspondenceId: entry.id, businessId: business.id })
}

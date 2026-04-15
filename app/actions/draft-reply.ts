'use server'

import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient } from '@/lib/ai/client'
import { AI_MODELS } from '@/lib/ai/models'

export async function generateDraftReply(
  correspondenceId: string,
): Promise<{ draft: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Fetch the triggering entry with business + contact info
  const { data: entry, error: entryError } = await supabase
    .from('correspondence')
    .select(`
      id, subject, formatted_text_current, direction, entry_date, business_id,
      businesses!inner(name),
      contacts(name, role)
    `)
    .eq('id', correspondenceId)
    .single()

  if (entryError || !entry) return { error: 'Entry not found' }

  const businessName = (entry.businesses as unknown as { name: string }).name
  const contactInfo = entry.contacts as unknown as { name: string; role?: string } | null
  const contactLine = contactInfo
    ? `${contactInfo.name}${contactInfo.role ? ` (${contactInfo.role})` : ''}`
    : 'the sender'

  // Fetch last 5 entries for that business (excluding the triggering one) as context
  const { data: context } = await supabase
    .from('correspondence')
    .select('subject, formatted_text_current, direction, entry_date')
    .eq('business_id', entry.business_id)
    .neq('id', correspondenceId)
    .order('entry_date', { ascending: false })
    .limit(5)

  const contextText = context?.length
    ? context
        .reverse()
        .map(c =>
          `[${(c.direction || 'note').toUpperCase()} – ${c.entry_date?.split('T')[0] ?? ''}]` +
          (c.subject ? ` ${c.subject}\n` : '\n') +
          (c.formatted_text_current || '').slice(0, 300),
        )
        .join('\n\n---\n\n')
    : 'No previous correspondence on file.'

  const prompt = `Draft a brief, professional reply to this email from ${contactLine} at ${businessName}. Tone: warm but concise. Do not include a greeting or sign-off. Base the draft ONLY on what is explicitly in the correspondence below — do not invent facts, commitments, or details.

Previous correspondence context (oldest first):
${contextText}

Email to reply to:
Subject: ${entry.subject || '(no subject)'}
${entry.formatted_text_current || ''}

Return ONLY the draft body text. No subject line, no greeting (e.g. "Dear…"), no sign-off (e.g. "Kind regards").`

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: AI_MODELS.ECONOMY,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    const draft = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    if (!draft) return { error: 'AI returned an empty draft' }
    return { draft }
  } catch (err) {
    console.error('generateDraftReply error:', err)
    return { error: 'AI unavailable — please try again' }
  }
}

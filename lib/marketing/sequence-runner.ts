/**
 * Email sequence runner
 * Processes enrollments and sends emails at scheduled times
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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

const resendApiKey = process.env.RESEND_API_KEY

interface Enrollment {
  id: string
  template_id: string
  user_id: string | null
  organization_id: string | null
  email: string
  current_step: number
  status: string
  metadata: Record<string, unknown>
}

interface SequenceStep {
  id: string
  template_id: string
  step_number: number
  delay_days: number
  delay_hours: number
  subject: string
  body_template: string
  goal: string
}

interface SequenceTemplate {
  id: string
  name: string
  trigger_event: string
}

/**
 * Enroll a user in an email sequence
 */
export async function enrollInSequence(
  triggerEvent: string,
  email: string,
  userId?: string,
  organizationId?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  // Find the active template for this trigger
  const { data: template, error: templateError } = await getSupabase()
    .from('email_sequence_templates')
    .select('id')
    .eq('trigger_event', triggerEvent)
    .eq('is_active', true)
    .single()

  if (templateError || !template) {
    console.error(`No active template for trigger: ${triggerEvent}`)
    return null
  }

  // Check if already enrolled in this sequence
  const { data: existing } = await getSupabase()
    .from('email_sequence_enrollments')
    .select('id')
    .eq('template_id', template.id)
    .eq('email', email)
    .eq('status', 'active')
    .single()

  if (existing) {
    console.log(`Already enrolled in sequence: ${email}`)
    return existing.id
  }

  // Get first step to calculate next_email_at
  const { data: firstStep } = await getSupabase()
    .from('email_sequence_steps')
    .select('delay_days, delay_hours')
    .eq('template_id', template.id)
    .eq('step_number', 1)
    .single()

  const nextEmailAt = calculateNextEmailTime(
    firstStep?.delay_days || 0,
    firstStep?.delay_hours || 0
  )

  // Create enrollment
  const { data: enrollment, error: enrollError } = await getSupabase()
    .from('email_sequence_enrollments')
    .insert({
      template_id: template.id,
      user_id: userId || null,
      organization_id: organizationId || null,
      email,
      current_step: 0,
      status: 'active',
      next_email_at: nextEmailAt.toISOString(),
      metadata: metadata || {},
    })
    .select('id')
    .single()

  if (enrollError) {
    console.error('Error creating enrollment:', enrollError)
    return null
  }

  return enrollment.id
}

/**
 * Process all due emails (called by cron)
 */
export async function processDueEmails(): Promise<{
  processed: number
  sent: number
  errors: number
}> {
  const results = { processed: 0, sent: 0, errors: 0 }

  // Find enrollments with due emails
  const { data: dueEnrollments, error: fetchError } = await getSupabase()
    .from('email_sequence_enrollments')
    .select('*')
    .eq('status', 'active')
    .lte('next_email_at', new Date().toISOString())
    .limit(100)

  if (fetchError) {
    console.error('Error fetching due enrollments:', fetchError)
    return results
  }

  if (!dueEnrollments || dueEnrollments.length === 0) {
    return results
  }

  for (const enrollment of dueEnrollments) {
    results.processed++
    try {
      const sent = await sendNextEmail(enrollment)
      if (sent) {
        results.sent++
      }
    } catch (error) {
      console.error(`Error processing enrollment ${enrollment.id}:`, error)
      results.errors++
    }
  }

  return results
}

/**
 * Send the next email in a sequence
 */
async function sendNextEmail(enrollment: Enrollment): Promise<boolean> {
  const nextStepNumber = enrollment.current_step + 1

  // Get the next step
  const { data: step, error: stepError } = await getSupabase()
    .from('email_sequence_steps')
    .select('*')
    .eq('template_id', enrollment.template_id)
    .eq('step_number', nextStepNumber)
    .eq('is_active', true)
    .single()

  if (stepError || !step) {
    // No more steps, mark as completed
    await getSupabase()
      .from('email_sequence_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id)
    return false
  }

  // Personalize email content
  const personalizedSubject = personalizeContent(step.subject, enrollment)
  const personalizedBody = personalizeContent(step.body_template, enrollment)

  // Send email
  const sent = await sendEmail(
    enrollment.email,
    personalizedSubject,
    personalizedBody
  )

  if (!sent) {
    return false
  }

  // Log the send
  await getSupabase().from('email_sequence_sends').insert({
    enrollment_id: enrollment.id,
    step_id: step.id,
    status: 'sent',
  })

  // Get next step to calculate next email time
  const { data: nextStep } = await getSupabase()
    .from('email_sequence_steps')
    .select('delay_days, delay_hours')
    .eq('template_id', enrollment.template_id)
    .eq('step_number', nextStepNumber + 1)
    .single()

  // Update enrollment
  await getSupabase()
    .from('email_sequence_enrollments')
    .update({
      current_step: nextStepNumber,
      last_email_sent_at: new Date().toISOString(),
      next_email_at: nextStep
        ? calculateNextEmailTime(nextStep.delay_days, nextStep.delay_hours).toISOString()
        : null,
    })
    .eq('id', enrollment.id)

  return true
}

/**
 * Send an email via Resend
 */
async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@correspondenceclerk.com'

  // Development mode
  if (!resendApiKey || process.env.NODE_ENV === 'development') {
    console.log('='.repeat(80))
    console.log('SEQUENCE EMAIL (dev mode)')
    console.log('='.repeat(80))
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log('')
    console.log(body)
    console.log('='.repeat(80))
    return true
  }

  try {
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from: `Correspondence Clerk <${fromEmail}>`,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    })
    return true
  } catch (error) {
    console.error('Resend error:', error)
    return false
  }
}

/**
 * Personalize content with user data
 */
function personalizeContent(
  template: string,
  enrollment: Enrollment
): string {
  let content = template
  const metadata = enrollment.metadata || {}

  // Standard replacements
  content = content.replace(/{{name}}/g, (metadata.name as string) || 'there')
  content = content.replace(/{{email}}/g, enrollment.email)
  content = content.replace(
    /{{entry_count}}/g,
    String((metadata.entry_count as number) || 0)
  )
  content = content.replace(
    /{{industry}}/g,
    (metadata.industry as string) || 'your industry'
  )

  // URLs
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  content = content.replace(/{{signup_url}}/g, `${baseUrl}/signup`)
  content = content.replace(/{{upgrade_url}}/g, `${baseUrl}/settings/billing`)
  content = content.replace(/{{review_url}}/g, 'https://g2.com/products/correspondence-clerk/reviews') // Placeholder

  // Resource-specific
  content = content.replace(
    /{{resource_link}}/g,
    (metadata.resource_link as string) || baseUrl
  )

  return content
}

/**
 * Calculate when the next email should be sent
 */
function calculateNextEmailTime(delayDays: number, delayHours: number): Date {
  const nextTime = new Date()
  nextTime.setDate(nextTime.getDate() + delayDays)
  nextTime.setHours(nextTime.getHours() + delayHours)
  return nextTime
}

/**
 * Pause an enrollment
 */
export async function pauseEnrollment(enrollmentId: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from('email_sequence_enrollments')
    .update({ status: 'paused' })
    .eq('id', enrollmentId)

  return !error
}

/**
 * Resume an enrollment
 */
export async function resumeEnrollment(enrollmentId: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from('email_sequence_enrollments')
    .update({
      status: 'active',
      next_email_at: new Date().toISOString(),
    })
    .eq('id', enrollmentId)

  return !error
}

/**
 * Unsubscribe from all sequences
 */
export async function unsubscribeFromSequences(email: string): Promise<boolean> {
  const { error } = await getSupabase()
    .from('email_sequence_enrollments')
    .update({ status: 'unsubscribed' })
    .eq('email', email)
    .eq('status', 'active')

  return !error
}

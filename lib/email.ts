/**
 * Email service for sending invitations
 * Uses Resend in production, console.log in development
 */

import { Resend } from 'resend'

const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@correspondenceclerk.com'

/**
 * Send an invitation email to a user
 */
export async function sendInvitationEmail(
  email: string,
  token: string,
  organizationName: string
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const invitationUrl = `${baseUrl}/invite/accept?token=${token}`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('='.repeat(80))
    console.log('INVITATION EMAIL (dev mode)')
    console.log('='.repeat(80))
    console.log(`To: ${email}`)
    console.log(`Subject: You've been invited to join ${organizationName} on Correspondence Clerk`)
    console.log(`Link: ${invitationUrl}`)
    console.log('='.repeat(80))
    return
  }

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: `Correspondence Clerk <${fromEmail}>`,
    to: email,
    subject: `You've been invited to join ${organizationName}`,
    text: `You've been invited to join ${organizationName} on Correspondence Clerk.\n\nClick the link below to accept the invitation and create your account:\n${invitationUrl}\n\nThis invitation will expire in 7 days.`,
    html: `
      <h1>You've been invited!</h1>
      <p>You've been invited to join <strong>${organizationName}</strong> on Correspondence Clerk.</p>
      <p><a href="${invitationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; font-weight: bold;">Accept Invitation</a></p>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${invitationUrl}">${invitationUrl}</a></p>
      <p style="color: #666; font-size: 14px;">This invitation will expire in 7 days.</p>
    `,
  })
}

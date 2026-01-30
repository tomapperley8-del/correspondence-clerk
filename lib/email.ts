/**
 * Email service for sending invitations
 * Uses SendGrid in production, console.log in development
 */

import sgMail from '@sendgrid/mail'

const sendGridApiKey = process.env.SENDGRID_API_KEY
if (sendGridApiKey) {
  sgMail.setApiKey(sendGridApiKey)
}

/**
 * Send an invitation email to a user
 * @param email - The email address to send to
 * @param token - The invitation token
 * @param organizationName - Name of the organization inviting the user
 */
export async function sendInvitationEmail(
  email: string,
  token: string,
  organizationName: string
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const invitationUrl = `${baseUrl}/invite/accept?token=${token}`

  // Development mode or missing API key: console log only
  if (!sendGridApiKey || process.env.NODE_ENV === 'development') {
    console.log('='.repeat(80))
    console.log('INVITATION EMAIL (dev mode)')
    console.log('='.repeat(80))
    console.log(`To: ${email}`)
    console.log(`From: ${organizationName}`)
    console.log(`Subject: You've been invited to join ${organizationName} on Correspondence Clerk`)
    console.log('')
    console.log('Message:')
    console.log(`You've been invited to join ${organizationName} on Correspondence Clerk.`)
    console.log('')
    console.log('Click the link below to accept the invitation and create your account:')
    console.log(invitationUrl)
    console.log('')
    console.log('This invitation will expire in 7 days.')
    console.log('='.repeat(80))
    return
  }

  // Production: send via SendGrid
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@correspondenceclerk.com'

  await sgMail.send({
    to: email,
    from: {
      email: fromEmail,
      name: 'Correspondence Clerk',
    },
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

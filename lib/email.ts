/**
 * Email service for sending invitations
 * MVP: Console logs invitation URLs
 * Production: Replace with SendGrid, AWS SES, or similar
 */

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
  // Construct invitation URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const invitationUrl = `${baseUrl}/invite/accept?token=${token}`

  // MVP: Console log the invitation URL
  console.log('='.repeat(80))
  console.log('INVITATION EMAIL')
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

  // TODO: Production implementation
  // Example with SendGrid:
  /*
  const sgMail = require('@sendgrid/mail')
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const msg = {
    to: email,
    from: 'noreply@correspondenceclerk.com',
    subject: `You've been invited to join ${organizationName}`,
    html: `
      <h1>You've been invited!</h1>
      <p>You've been invited to join ${organizationName} on Correspondence Clerk.</p>
      <p><a href="${invitationUrl}">Click here to accept the invitation</a></p>
      <p>This invitation will expire in 7 days.</p>
    `
  }

  await sgMail.send(msg)
  */
}

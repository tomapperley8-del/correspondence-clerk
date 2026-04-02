import sgMail from '@sendgrid/mail'

const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@correspondenceclerk.com'
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export function countUrgentItems(content: string): number {
  // Extract text between "(1) Urgent" and "(2) On the radar"
  const match = content.match(/\(1\)\s*Urgent([\s\S]*?)(?=\(2\))/i)
  if (!match) return 0
  const section = match[1]
  // Treat as empty if only "nothing" / "none" / "no urgent"
  if (/\b(none|nothing|no urgent)\b/i.test(section.trim()) && section.trim().split('\n').length <= 2) return 0
  // Count bullet/numbered lines
  return (section.match(/^[\s]*[-*•]|\d+\./gm) || []).length
}

export function buildBriefingSubject(urgentCount: number): string {
  if (urgentCount === 0) return 'Nothing urgent today — your morning briefing'
  if (urgentCount === 1) return '1 thing needs your attention today'
  return `${urgentCount} things need your attention today`
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n')
  const htmlLines: string[] = []
  let inList = false

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push(`<h2 style="color:#1E293B;font-family:Georgia,serif;font-size:18px;margin:24px 0 8px;">${line.replace(/^##\s+/, '')}</h2>`)
    } else if (/^###\s+/.test(line)) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push(`<h3 style="color:#2C4A6E;font-size:15px;margin:16px 0 6px;">${line.replace(/^###\s+/, '')}</h3>`)
    } else if (/^[-*•]\s+/.test(line)) {
      if (!inList) { htmlLines.push('<ul style="margin:4px 0 12px;padding-left:20px;">'); inList = true }
      htmlLines.push(`<li style="margin-bottom:4px;color:#334155;">${line.replace(/^[-*•]\s+/, '')}</li>`)
    } else if (line.trim() === '') {
      if (inList) { htmlLines.push('</ul>'); inList = false }
    } else {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push(`<p style="margin:8px 0;color:#334155;">${line}</p>`)
    }
  }
  if (inList) htmlLines.push('</ul>')
  return htmlLines.join('\n')
}

export async function sendBriefingEmail(
  email: string,
  displayName: string | null,
  content: string
): Promise<void> {
  const name = displayName || 'there'
  const urgentCount = countUrgentItems(content)
  const subject = buildBriefingSubject(urgentCount)
  const insightsUrl = `${baseUrl}/insights`

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:Inter,sans-serif;font-size:14px;background:#FAFAF8;padding:24px;">
      <div style="background:#1E293B;padding:16px 24px;border-radius:4px 4px 0 0;">
        <span style="color:#fff;font-family:Georgia,serif;font-size:20px;font-weight:bold;">Correspondence Clerk</span>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid rgba(0,0,0,0.06);border-top:none;">
        <p style="color:#334155;margin:0 0 16px;">Morning ${name},</p>
        ${markdownToHtml(content)}
        <hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:24px 0;">
        <p style="text-align:center;">
          <a href="${insightsUrl}" style="background:#2C4A6E;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;">Open Insights</a>
        </p>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px;">
          <a href="${baseUrl}/settings" style="color:#94a3b8;">Manage email preferences</a>
        </p>
      </div>
    </div>`

  const text = `Morning ${name},\n\n${content}\n\nOpen Insights: ${insightsUrl}\n\nManage preferences: ${baseUrl}/settings`

  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) {
    console.log('[briefing-email] Dev mode — would send to:', email, '\nSubject:', subject, '\n\n', text)
    return
  }

  sgMail.setApiKey(apiKey)
  await sgMail.send({ to: email, from: { email: fromEmail, name: 'Correspondence Clerk' }, subject, html, text })
}

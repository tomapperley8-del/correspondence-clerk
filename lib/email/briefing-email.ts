import { Resend } from 'resend'

const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@correspondenceclerk.com'
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Action items — structured items from the Actions page, rendered with
// one-click Done / Snooze buttons in the email
// ---------------------------------------------------------------------------
export interface BriefingActionItem {
  id: string
  businessId: string
  businessName: string
  subject: string
  badgeLabel: string      // e.g. "REPLY · 8d ago", "OVERDUE · 2d", "DUE TODAY"
  badgeColour: 'red' | 'amber' | 'blue'
  doneUrl: string
  snoozeUrl: string
}

// ---------------------------------------------------------------------------
// Subject line helpers
// ---------------------------------------------------------------------------
export function countUrgentItems(content: string): number {
  // Extract text between "(1) Urgent" and "(2) On the radar"
  const match = content.match(/\(1\)\s*Urgent([\s\S]*?)(?=\(2\))/i)
  if (!match) return 0
  const section = match[1]
  if (/\b(none|nothing|no urgent)\b/i.test(section.trim()) && section.trim().split('\n').length <= 2) return 0
  return (section.match(/^[\s]*[-*•]|\d+\./gm) || []).length
}

export function buildBriefingSubject(urgentCount: number, actionCount: number): string {
  const total = urgentCount + actionCount
  if (total === 0) return 'Nothing urgent today — your morning briefing'
  if (total === 1) return '1 thing needs your attention today'
  return `${total} things need your attention today`
}

// ---------------------------------------------------------------------------
// Markdown → HTML (AI briefing prose section)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Actions section HTML — one row per item with inline Done / Snooze buttons
// ---------------------------------------------------------------------------
function buildActionsHtml(items: BriefingActionItem[]): string {
  if (items.length === 0) return ''

  const badgeBg = { red: '#fef2f2', amber: '#fffbeb', blue: '#eff6ff' }
  const badgeText = { red: '#b91c1c', amber: '#92400e', blue: '#1e40af' }

  const rows = items.map(item => {
    const bg = badgeBg[item.badgeColour]
    const fg = badgeText[item.badgeColour]

    return `
      <tr>
        <td style="padding:0 0 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:3px;">
            <tr>
              <td style="padding:12px 16px;">
                <div style="margin-bottom:6px;">
                  <span style="display:inline-block;background:${bg};color:${fg};font-size:11px;font-weight:600;padding:2px 8px;border-radius:2px;letter-spacing:0.03em;">${item.badgeLabel}</span>
                  <span style="font-size:14px;font-weight:600;color:#1E293B;margin-left:8px;">${escapeHtml(item.businessName)}</span>
                </div>
                <div style="font-size:13px;color:#64748b;margin-bottom:10px;">${escapeHtml(item.subject)}</div>
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:8px;">
                      <a href="${item.doneUrl}" style="display:inline-block;background:#2C4A6E;color:#fff;padding:6px 14px;border-radius:3px;text-decoration:none;font-size:12px;font-weight:500;">Mark done</a>
                    </td>
                    <td>
                      <a href="${item.snoozeUrl}" style="display:inline-block;background:#f1f5f9;color:#475569;padding:6px 14px;border-radius:3px;text-decoration:none;font-size:12px;font-weight:500;">Snooze 1 week</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  }).join('')

  return `
    <h2 style="color:#1E293B;font-family:Georgia,serif;font-size:18px;margin:0 0 12px;">Actions today</h2>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${rows}
    </table>
    <hr style="border:none;border-top:1px solid rgba(0,0,0,0.08);margin:8px 0 24px;">`
}

// ---------------------------------------------------------------------------
// Actions section plain-text fallback
// ---------------------------------------------------------------------------
function buildActionsText(items: BriefingActionItem[], actionsUrl: string): string {
  if (items.length === 0) return ''

  const lines = ['Actions today', '─'.repeat(40)]
  for (const item of items) {
    lines.push(`${item.badgeLabel} — ${item.businessName}`)
    lines.push(`  ${item.subject}`)
    lines.push(`  Done: ${item.doneUrl}`)
    lines.push(`  Snooze: ${item.snoozeUrl}`)
    lines.push('')
  }
  lines.push(`View all: ${actionsUrl}`)
  lines.push('')
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Main send function
// ---------------------------------------------------------------------------
export async function sendBriefingEmail(
  email: string,
  displayName: string | null,
  content: string,
  actionItems: BriefingActionItem[] = []
): Promise<void> {
  const name = displayName || 'there'
  const urgentCount = countUrgentItems(content)
  const subject = buildBriefingSubject(urgentCount, actionItems.length)
  const insightsUrl = `${baseUrl}/insights`
  const actionsUrl = `${baseUrl}/actions`

  const actionsHtml = buildActionsHtml(actionItems)
  const actionsText = buildActionsText(actionItems, actionsUrl)

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:Inter,sans-serif;font-size:14px;background:#FAFAF8;padding:24px;">
      <div style="background:#1E293B;padding:16px 24px;border-radius:4px 4px 0 0;">
        <span style="color:#fff;font-family:Georgia,serif;font-size:20px;font-weight:bold;">Correspondence Clerk</span>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid rgba(0,0,0,0.06);border-top:none;">
        <p style="color:#334155;margin:0 0 20px;">Morning ${name},</p>
        ${actionsHtml}
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

  const text = `Morning ${name},\n\n${actionsText}${content}\n\nOpen Insights: ${insightsUrl}\n\nManage preferences: ${baseUrl}/settings`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[briefing-email] Dev mode — would send to:', email, '\nSubject:', subject, '\n\n', text)
    return
  }

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: `Correspondence Clerk <${fromEmail}>`,
    to: email,
    subject,
    html,
    text,
  })
}

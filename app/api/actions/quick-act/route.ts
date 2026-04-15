/**
 * One-click action endpoint for daily briefing email links.
 *
 * Handles GET /api/actions/quick-act?token=...
 *
 * Validates the HMAC-signed token, performs the action (done or snooze),
 * and returns a simple branded HTML confirmation page — no login required.
 *
 * Security:
 *  - Token is HMAC-SHA256 signed, 48h expiry
 *  - userId in token is verified against the correspondence's org
 *  - No sensitive data exposed in response
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { verifyActionToken } from '@/lib/email/action-token'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://correspondence-clerk.vercel.app'

// ---------------------------------------------------------------------------
// HTML response page — simple branded confirmation, no JS required
// ---------------------------------------------------------------------------
function htmlPage(title: string, body: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Correspondence Clerk</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: Inter, system-ui, -apple-system, sans-serif;
      background: #FAFAF8;
      margin: 0;
      padding: 48px 24px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
    }
    .card {
      max-width: 440px;
      width: 100%;
      background: #fff;
      border: 1px solid rgba(0,0,0,0.06);
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .header {
      background: #1E293B;
      padding: 14px 24px;
    }
    .header span {
      color: #fff;
      font-family: Georgia, serif;
      font-size: 17px;
      font-weight: bold;
    }
    .body { padding: 32px 24px; text-align: center; }
    .check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: #f0fdf4;
      border-radius: 50%;
      margin-bottom: 16px;
      font-size: 22px;
    }
    h1 {
      color: #1E293B;
      font-family: Georgia, serif;
      font-size: 20px;
      margin: 0 0 10px;
      font-weight: normal;
    }
    p { color: #64748b; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
    .btn {
      display: inline-block;
      background: #2C4A6E;
      color: #fff;
      padding: 10px 22px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 14px;
      transition: background 0.2s;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><span>Correspondence Clerk</span></div>
    <div class="body">${body}</div>
  </div>
</body>
</html>`
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return htmlPage(
      'Invalid link',
      `<div class="check">✗</div>
       <h1>Invalid link</h1>
       <p>This action link is missing its token.</p>
       <a class="btn" href="${baseUrl}/actions">Open Actions</a>`
    )
  }

  const payload = verifyActionToken(token)
  if (!payload) {
    return htmlPage(
      'Link expired',
      `<div class="check">✗</div>
       <h1>Link expired</h1>
       <p>Action links are valid for 48 hours after the briefing email is sent.
          You can take action directly in the app.</p>
       <a class="btn" href="${baseUrl}/actions">Open Actions</a>`
    )
  }

  const supabase = createServiceRoleClient()

  // Fetch entry + business, verify it still exists
  const { data: entry } = await supabase
    .from('correspondence')
    .select('id, business_id, action_needed, due_at, ai_metadata, businesses!inner(name, organization_id)')
    .eq('id', payload.id)
    .maybeSingle()

  if (!entry) {
    return htmlPage(
      'Already cleared',
      `<div class="check">✓</div>
       <h1>Already cleared</h1>
       <p>This entry has already been removed or doesn't exist.</p>
       <a class="btn" href="${baseUrl}/actions">Open Actions</a>`
    )
  }

  // Verify the acting user belongs to the same org
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', payload.userId)
    .maybeSingle()

  const biz = entry.businesses as unknown as { name: string; organization_id: string }

  if (!profile || profile.organization_id !== biz.organization_id) {
    return htmlPage(
      'Not authorised',
      `<div class="check">✗</div>
       <h1>Not authorised</h1>
       <p>You are not authorised to perform this action.</p>
       <a class="btn" href="${baseUrl}/actions">Open Actions</a>`
    )
  }

  const businessName = biz.name
  const existingMeta = (entry.ai_metadata as Record<string, unknown>) ?? {}

  // ---------------------------------------------------------------------------
  // Mark done
  // ---------------------------------------------------------------------------
  if (payload.action === 'done') {
    await supabase
      .from('correspondence')
      .update({
        action_needed: 'none',
        due_at: null,
        reply_dismissed_at: new Date().toISOString(),
        ai_metadata: {
          ...existingMeta,
          resolution: {
            cleared_by: 'user',
            reason: 'quick_act_email',
            cleared_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', payload.id)

    return htmlPage(
      'Marked as done',
      `<div class="check">✓</div>
       <h1>Marked as done</h1>
       <p><strong>${businessName}</strong> has been cleared from your Actions list.</p>
       <a class="btn" href="${baseUrl}/actions">Open Actions</a>`
    )
  }

  // ---------------------------------------------------------------------------
  // Snooze 7 days
  // ---------------------------------------------------------------------------
  if (payload.action === 'snooze') {
    const snoozeUntil = new Date()
    snoozeUntil.setDate(snoozeUntil.getDate() + 7)
    const snoozeDate = snoozeUntil.toISOString().split('T')[0]

    await supabase
      .from('correspondence')
      .update({ due_at: snoozeDate })
      .eq('id', payload.id)

    const displayDate = snoozeUntil.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

    return htmlPage(
      'Snoozed for 1 week',
      `<div class="check">✓</div>
       <h1>Snoozed</h1>
       <p><strong>${businessName}</strong> will reappear in your Actions on ${displayDate}.</p>
       <a class="btn" href="${baseUrl}/actions">Open Actions</a>`
    )
  }

  return htmlPage(
    'Unknown action',
    `<div class="check">✗</div>
     <h1>Unknown action</h1>
     <p>This link contains an unrecognised action type.</p>
     <a class="btn" href="${baseUrl}/actions">Open Actions</a>`
  )
}

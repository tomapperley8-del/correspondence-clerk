/**
 * Send a test email to the user's inbound address via Postmark.
 * Used from the Settings > Email Forwarding section to verify setup.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('inbound_email_token')
    .eq('id', user.id)
    .single()

  const token = profile?.inbound_email_token as string | null
  if (!token) {
    return NextResponse.json({ error: 'No inbound email token found' }, { status: 400 })
  }

  const serverToken = process.env.POSTMARK_SERVER_TOKEN
  if (!serverToken) {
    return NextResponse.json(
      { error: 'POSTMARK_SERVER_TOKEN not configured' },
      { status: 500 }
    )
  }

  const toAddress = `${token}@correspondenceclerk.com`

  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': serverToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: 'noreply@correspondenceclerk.com',
        To: toAddress,
        Subject: 'Test email from Correspondence Clerk',
        TextBody: [
          'This is a test email sent by Correspondence Clerk to verify your inbound forwarding is working.',
          '',
          'If you see this email appear in your Inbox queue, everything is set up correctly.',
          '',
          'You can discard this test email from the Inbox page.',
        ].join('\n'),
        MessageStream: 'outbound',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[send-test] Postmark error:', res.status, body)
      return NextResponse.json(
        { error: `Postmark error: ${res.status}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ sent: true, to: toAddress })
  } catch (err) {
    console.error('[send-test] Fetch error:', err)
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 })
  }
}

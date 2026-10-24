import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { readNewsletterForOrg } from '@/lib/newsletter/read'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * Newsletter issues, weekly (UI overhaul Stage 16a). Vercel cron, Wednesday after it goes out.
 *
 * Reads new issues of The Chiswick Calendar Newsletter from Mailchimp's public archive (free, no
 * login, no AI), stores them in newsletter_issues and re-finds mentions. Each run is recorded in
 * newsletter_read_runs. Also callable by a logged-in user for their own organisation.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const isCron = !!secret && request.headers.get('authorization') === `Bearer ${secret}`

  let orgIds: string[]
  const supabase = createServiceRoleClient()
  if (isCron) {
    const { data, error } = await supabase.from('organizations').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    orgIds = (data ?? []).map((o: { id: string }) => o.id)
  } else {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const orgId = await getCurrentUserOrganizationId()
    if (!orgId) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
    orgIds = [orgId]
  }

  const results = []
  for (const orgId of orgIds) {
    results.push({ org: orgId, ...(await readNewsletterForOrg(supabase, orgId, { trigger: isCron ? 'cron' : 'user' })) })
  }
  const failed = results.some((r) => !r.ok)
  if (failed) console.error('[newsletter-issues]', results.filter((r) => !r.ok).map((r) => r.error).join('; '))
  return NextResponse.json({ results }, { status: failed ? 502 : 200 })
}

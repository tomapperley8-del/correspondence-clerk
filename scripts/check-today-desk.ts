/**
 * Stage 18 pre-merge check: Today, the nav badge and the morning desk email must agree.
 * No paid calls, no writes, local copy only. Run before every merge (docs/ui-overhaul-plan.md,
 * "Merge steps"):
 *
 *   bash supabase/.local/check18.sh          (sets the local env, then runs this)
 *
 * 1. Signs in as the local test user (anon key, so row security applies as it does for Tom)
 *    and loads Today's items with the page's own loader (lib/today-source.ts). The nav badge
 *    is getOverdueCount's rule over the same items.
 * 2. Calls the desk email route's GET with ?dry=1 (no pipeline, no send) on the service role.
 * 3. Compares: the badge = Today's overdue count = the email's "Overdue (n)"; every Today group
 *    heading and line in the email = Today's; the email's System line = Today's banner.
 * Exits 1 and prints every difference if anything disagrees.
 */
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { loadTodayCore, loadSystemMisses } from '../lib/today-source'
import { overdueItems } from '../lib/today'
import { todaySections } from '../lib/email/desk-email'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error('Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not the local copy.')
  process.exit(2)
}

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')

function emailSections(html: string) {
  const out = new Map<string, string[]>()
  for (const m of html.matchAll(/<p><strong>(.*?)<\/strong><\/p><ul>(.*?)<\/ul>/g)) {
    out.set(decode(m[1]), [...m[2].matchAll(/<li>(.*?)<\/li>/g)].map((x) => decode(x[1])))
  }
  const system = /<p style="color:#9B1C1C"><strong>(System: .*?)<\/strong><\/p>/.exec(html)?.[1]
  return { sections: out, system: system ? decode(system) : null }
}

async function main() {
  const login = readFileSync(process.env.TEST_LOGIN_FILE ?? 'supabase/.local/local_test_login.txt', 'utf8')
  const email = /^email=(.+)$/m.exec(login)?.[1]?.trim()
  const password = /^pass=(.+)$/m.exec(login)?.[1]?.trim()
  if (!email || !password) throw new Error('No test login found')

  const user = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data: signedIn, error: signInError } = await user.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`)
  const { data: profile } = await user.from('user_profiles').select('organization_id').eq('id', signedIn.user.id).single()
  const orgId = profile?.organization_id as string
  if (!orgId) throw new Error('The test user has no organisation')
  process.env.DESK_EMAIL_ORG_ID ??= orgId

  // Today and the badge, as the signed-in pages load them
  const core = await loadTodayCore(user, orgId)
  const todayOverdue = overdueItems(core.items, core.today)
  const badge = todayOverdue.length // getOverdueCount() in app/actions/today.ts
  const todayWant = todaySections(core.today, core.items)
  const banner = await loadSystemMisses(user)

  // The desk email, dry run
  process.env.CRON_SECRET ??= 'local-check'
  const { GET } = await import('../app/api/cron/desk-email/route')
  const res = await GET(new NextRequest('http://localhost/api/cron/desk-email?dry=1', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }))
  const html = await res.text()
  if (res.status !== 200) throw new Error(`Desk email dry run answered ${res.status}: ${html.slice(0, 300)}`)
  const got = emailSections(html)
  if (process.env.SAVE_DESK_HTML) writeFileSync(process.env.SAVE_DESK_HTML, html)

  const problems: string[] = []
  const emailOverdueHeading = [...got.sections.keys()].find((h) => h.startsWith('Overdue ('))
  const emailOverdue = emailOverdueHeading ? Number(/\((\d+)\)/.exec(emailOverdueHeading)![1]) : 0
  if (badge !== todayOverdue.length || emailOverdue !== badge) {
    problems.push(`Overdue: nav badge ${badge}, Today ${todayOverdue.length}, desk email ${emailOverdue}`)
  }
  for (const s of todayWant) {
    const lines = got.sections.get(s.heading)
    if (!lines) { problems.push(`Desk email has no "${s.heading}" (Today has it)`); continue }
    const missing = s.items.filter((i) => !lines.includes(i))
    const extra = lines.filter((i) => !s.items.includes(i))
    if (missing.length || extra.length) {
      problems.push(`"${s.heading}" differs:` +
        missing.map((i) => `\n    only on Today: ${i}`).join('') + extra.map((i) => `\n    only in email: ${i}`).join(''))
    }
  }
  const todayHeads = new Set(todayWant.map((s) => s.heading.replace(/ \(\d+\)$/, '')))
  for (const h of got.sections.keys()) {
    const base = h.replace(/ \(\d+\)$/, '')
    if (['Overdue', 'Money owed', 'Renewals', 'Club Card ended, page still live', 'Waiting on you', 'Your to-dos', 'Club Card pages'].includes(base) && !todayHeads.has(base)) {
      problems.push(`Desk email has "${h}", Today has none`)
    }
  }
  const bannerLine = banner.length ? `System: ${banner.map((m) => m.line).join('; ')}.` : null
  if ((bannerLine === null) !== (got.system === null) || (bannerLine && !got.system!.startsWith(bannerLine))) {
    problems.push(`System line: Today banner ${JSON.stringify(bannerLine)}, desk email ${JSON.stringify(got.system)}`)
  }

  console.log(`Today ${core.today}: overdue ${todayOverdue.length}, badge ${badge}, email ${emailOverdue}; ` +
    `${todayWant.length} Today sections checked; system misses ${banner.length}; email sections ${got.sections.size}.`)
  if (problems.length) {
    console.error(`\nFAIL: Today, the badge and the desk email disagree (${problems.length}):\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  console.log('PASS: Today, the nav badge and the desk email agree.')
}

main().catch((e) => { console.error('FAIL:', e instanceof Error ? e.message : e); process.exit(1) })

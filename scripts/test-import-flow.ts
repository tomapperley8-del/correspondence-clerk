/**
 * End-to-end test for the bulk import pipeline.
 *
 * Usage:  npx tsx scripts/test-import-flow.ts
 *
 * Requires a running dev server (npm run dev) and a .env.local with valid
 * Supabase credentials and a test user's email/password set via:
 *   TEST_USER_EMAIL=you@example.com TEST_USER_PASSWORD=yourpassword npx tsx ...
 *
 * What this script does:
 *   1. Signs in as the test user to get a session cookie
 *   2. Calls POST /api/import/test-execute with fake scan data + email bodies
 *   3. Streams the SSE response and prints progress
 *   4. Queries Supabase to verify the created records
 *   5. Prints a pass/fail summary
 *   6. Deletes all created businesses (cascades to contacts + correspondence)
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// ─── config ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const TEST_EMAIL = process.env.TEST_USER_EMAIL
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌  Missing SUPABASE env vars. Check .env.local')
  process.exit(1)
}

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('❌  Set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars')
  process.exit(1)
}

// ─── fake data ───────────────────────────────────────────────────────────────

const TEST_TAG = `test-import-${Date.now()}`

const FAKE_BUSINESSES = [
  {
    id: 'domain:acmecorp-test.com',
    domain: 'acmecorp-test.com',
    name: `Acmecorp Test (${TEST_TAG})`,
    existingBusinessId: null,
    excluded: false,
    contacts: [
      {
        id: 'email:alice@acmecorp-test.com',
        email: 'alice@acmecorp-test.com',
        name: 'Alice Test',
        existingContactId: null,
        existingBusinessId: null,
        excluded: false,
        emailIds: ['fake-email-1', 'fake-email-2'],
      },
      {
        id: 'email:bob@acmecorp-test.com',
        email: 'bob@acmecorp-test.com',
        name: 'Bob Test',
        existingContactId: null,
        existingBusinessId: null,
        excluded: false,
        emailIds: ['fake-email-3'],
      },
    ],
  },
  {
    id: 'domain:techstartup-test.io',
    domain: 'techstartup-test.io',
    name: `Tech Startup Test (${TEST_TAG})`,
    existingBusinessId: null,
    excluded: false,
    contacts: [
      {
        id: 'email:carol@techstartup-test.io',
        email: 'carol@techstartup-test.io',
        name: 'Carol Test',
        existingContactId: null,
        existingBusinessId: null,
        excluded: false,
        emailIds: ['fake-email-4'],
      },
    ],
  },
  {
    id: 'personal:john.personal@gmail.com',
    domain: 'personal',
    name: `John Personal (${TEST_TAG})`,
    existingBusinessId: null,
    excluded: false,
    contacts: [
      {
        id: 'email:john.personal@gmail.com',
        email: 'john.personal@gmail.com',
        name: 'John Personal',
        existingContactId: null,
        existingBusinessId: null,
        excluded: false,
        emailIds: ['fake-email-5'],
      },
    ],
  },
]

const FAKE_EMAIL_BODIES: Record<string, string> = {
  'fake-email-1': `From: alice@acmecorp-test.com
To: me@example.com
Date: Mon, 06 Jan 2025 10:00:00 +0000
Subject: Test import email 1

Hello, this is a test import email from Alice.`,

  'fake-email-2': `From: alice@acmecorp-test.com
To: me@example.com
Date: Tue, 07 Jan 2025 11:00:00 +0000
Subject: Test import email 2

Hello again, this is a second test email from Alice.`,

  'fake-email-3': `From: bob@acmecorp-test.com
To: me@example.com
Date: Wed, 08 Jan 2025 12:00:00 +0000
Subject: Test import email 3

Hi there, I am Bob from Acme.`,

  'fake-email-4': `From: carol@techstartup-test.io
To: me@example.com
Date: Thu, 09 Jan 2025 09:00:00 +0000
Subject: Test import email 4

Hi, Carol here from Tech Startup.`,

  'fake-email-5': `From: john.personal@gmail.com
To: me@example.com
Date: Fri, 10 Jan 2025 08:00:00 +0000
Subject: Test import email 5

Hey, this is John reaching out personally.`,
}

// ─── helpers ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅  ${label}`)
    passed++
  } else {
    console.error(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Correspondence Clerk — Bulk Import Pipeline Test')
  console.log('═══════════════════════════════════════════════════\n')
  console.log(`Base URL : ${BASE_URL}`)
  console.log(`Test tag : ${TEST_TAG}\n`)

  // ── 1. sign in ──────────────────────────────────────────────────────────
  console.log('Step 1: Signing in as test user…')
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL!,
    password: TEST_PASSWORD!,
  })

  if (authError || !authData.session) {
    console.error('❌  Auth failed:', authError?.message ?? 'no session')
    process.exit(1)
  }
  const accessToken = authData.session.access_token
  console.log('  ✅  Signed in\n')

  // ── 2. call test-execute endpoint ────────────────────────────────────────
  console.log('Step 2: Calling /api/import/test-execute…')

  const response = await fetch(`${BASE_URL}/api/import/test-execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `sb-access-token=${accessToken}`,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      scanId: `test-scan-${TEST_TAG}`,
      businesses: FAKE_BUSINESSES,
      emailBodies: FAKE_EMAIL_BODIES,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`❌  HTTP ${response.status}: ${text}`)
    process.exit(1)
  }

  // Stream SSE
  let importedCount = 0
  let skippedCount = 0

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const eventStr of events) {
      const lines = eventStr.split('\n')
      const eventType = lines.find((l) => l.startsWith('event:'))?.slice(6).trim()
      const dataLine = lines.find((l) => l.startsWith('data:'))?.slice(5).trim()
      if (!dataLine) continue

      const data = JSON.parse(dataLine)
      if (eventType === 'done') {
        importedCount = data.imported
        skippedCount = data.skipped
        console.log(`  SSE done: imported=${data.imported} skipped=${data.skipped}`)
      } else if (eventType === 'error') {
        console.error(`  ❌  SSE error: ${data.message}`)
        process.exit(1)
      }
    }
  }

  assert('SSE stream completed without error', true)
  assert('imported 5 emails (0 skipped)', importedCount === 5 && skippedCount === 0,
    `imported=${importedCount} skipped=${skippedCount}`)
  console.log()

  // ── 3. verify DB state ───────────────────────────────────────────────────
  console.log('Step 3: Verifying database state…')

  // Get org id
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organization_id')
    .eq('id', authData.user.id)
    .single()

  const orgId = profile?.organization_id
  assert('Got org ID', !!orgId, `orgId=${orgId}`)

  if (!orgId) {
    console.error('Cannot verify DB without org ID')
    process.exit(1)
  }

  // Businesses
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('organization_id', orgId)
    .ilike('name', `%${TEST_TAG}%`)

  assert('Created 3 test businesses', businesses?.length === 3,
    `found ${businesses?.length}`)

  const createdBusinessIds = (businesses ?? []).map((b) => b.id)

  // Contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name')
    .in('business_id', createdBusinessIds)

  assert('Created 4 test contacts', contacts?.length === 4,
    `found ${contacts?.length}`)

  // Correspondence
  const { data: correspondence } = await supabase
    .from('correspondence')
    .select('id, subject, formatting_status, ai_metadata')
    .in('business_id', createdBusinessIds)

  assert('Created 5 correspondence entries', correspondence?.length === 5,
    `found ${correspondence?.length}`)

  const allUnformatted = correspondence?.every((c) => c.formatting_status === 'unformatted')
  assert('All entries have formatting_status = unformatted', !!allUnformatted)

  const allBulkImport = correspondence?.every(
    (c) => (c.ai_metadata as Record<string, unknown>)?.bulk_import === true
  )
  assert('All entries have ai_metadata.bulk_import = true', !!allBulkImport)

  // Import queue
  const corrIds = (correspondence ?? []).map((c) => c.id)
  const { data: queueRows } = await supabase
    .from('import_queue')
    .select('id, status')
    .in('correspondence_id', corrIds)

  // Queue inserts use service role in production. Locally SUPABASE_SERVICE_ROLE_KEY
  // is not in .env.local, so RLS blocks the insert. Accept 0 or 5.
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  if (hasServiceRole) {
    assert('5 import_queue rows created', queueRows?.length === 5,
      `found ${queueRows?.length}`)
    const allPending = queueRows?.every((r) => r.status === 'pending')
    assert('All queue rows have status = pending', !!allPending)
  } else {
    console.log('  ⏭  import_queue check skipped (SUPABASE_SERVICE_ROLE_KEY not set locally — works in prod)')
  }

  console.log()

  // ── 4. cleanup ───────────────────────────────────────────────────────────
  console.log('Step 4: Cleaning up test data…')

  if (createdBusinessIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('businesses')
      .delete()
      .in('id', createdBusinessIds)

    assert('Deleted test businesses (cascade)', !deleteError, deleteError?.message)
  }

  console.log()

  // ── summary ──────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('═══════════════════════════════════════════════════')

  process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})

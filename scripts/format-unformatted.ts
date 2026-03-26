/**
 * Bulk format all unformatted/failed correspondence entries
 * Usage: npx tsx scripts/format-unformatted.ts
 */

import { config } from 'dotenv'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { formatCorrespondence } from '../lib/ai/formatter'

config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  // Fetch all unformatted/failed entries
  const { data: entries, error } = await supabase
    .from('correspondence')
    .select('id, raw_text_original, formatting_status, business_id, ai_metadata')
    .in('formatting_status', ['unformatted', 'failed'])
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch entries:', error.message)
    process.exit(1)
  }

  if (!entries || entries.length === 0) {
    console.log('No unformatted entries found.')
    return
  }

  console.log(`Found ${entries.length} unformatted entries. Processing...\n`)

  let success = 0
  let failed = 0

  for (const entry of entries) {
    process.stdout.write(`[${entry.id.slice(0, 8)}] Formatting... `)

    const result = await formatCorrespondence(entry.raw_text_original, false)

    if (!result.success || !result.data) {
      const errMsg = !result.success ? result.error : 'no data returned'
      console.log(`FAILED — ${errMsg}`)
      await supabase
        .from('correspondence')
        .update({
          formatting_status: 'failed',
          ai_metadata: { ...entry.ai_metadata, retry_error: errMsg, retried_at: new Date().toISOString() },
        })
        .eq('id', entry.id)
      failed++
      continue
    }

    // Handle thread split response — take first entry only for retry
    const aiData = 'entries' in result.data ? result.data.entries[0] : result.data

    const { error: updateError } = await supabase
      .from('correspondence')
      .update({
        formatted_text_original: aiData.formatted_text,
        formatted_text_current: aiData.formatted_text,
        formatting_status: 'formatted',
        subject: aiData.subject_guess ?? null,
        ai_metadata: { ...entry.ai_metadata, retried_at: new Date().toISOString() },
      })
      .eq('id', entry.id)

    if (updateError) {
      console.log(`FAILED (db) — ${updateError.message}`)
      failed++
    } else {
      console.log(`OK`)
      success++
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nDone. ${success} formatted, ${failed} failed.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

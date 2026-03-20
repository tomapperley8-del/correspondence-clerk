/**
 * Run Migrations Script
 *
 * Runs all SQL migrations against the connected Supabase project.
 * Run with: npm run db:migrate
 *
 * Note: This is a simplified migration runner for development.
 * For production, use Supabase CLI: supabase db push
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')

async function runMigrations() {
  console.log('Running migrations...\n')

  // Get all migration files (excluding COMBINED file)
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(
      (f) =>
        f.endsWith('.sql') &&
        !f.startsWith('COMBINED') &&
        !f.includes('test')
    )
    .sort()

  console.log(`Found ${files.length} migration files\n`)

  // Create migrations tracking table if it doesn't exist
  const { error: createTableError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT now()
      );
    `,
  })

  // If exec_sql doesn't exist, we need to run migrations directly
  // This is expected for fresh databases
  if (createTableError) {
    console.log(
      'Note: Running migrations directly (exec_sql RPC not available)\n'
    )
    console.log('For a fresh database, use Supabase CLI instead:')
    console.log('  supabase db push\n')
    console.log('Or run migrations via Supabase dashboard SQL editor.\n')

    // List migrations that need to be run
    console.log('Migrations to run:')
    files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`)
    })

    return
  }

  // Get already executed migrations
  const { data: executed } = await supabase
    .from('_migrations')
    .select('name')

  const executedNames = new Set(executed?.map((m) => m.name) || [])

  // Run pending migrations
  let runCount = 0
  for (const file of files) {
    if (executedNames.has(file)) {
      console.log(`[SKIP] ${file} (already executed)`)
      continue
    }

    const filePath = path.join(MIGRATIONS_DIR, file)
    const sql = fs.readFileSync(filePath, 'utf-8')

    console.log(`[RUN] ${file}...`)

    const { error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error(`[FAIL] ${file}:`, error.message)
      process.exit(1)
    }

    // Record migration
    await supabase.from('_migrations').insert({ name: file })
    runCount++
    console.log(`[OK] ${file}`)
  }

  console.log(`\nMigrations complete. Ran ${runCount} new migrations.`)
}

runMigrations().catch(console.error)

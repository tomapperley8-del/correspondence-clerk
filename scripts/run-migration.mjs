/**
 * Migration Runner Script
 * Runs the formatting_status migration using Supabase client
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Read migration file
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20250116_001_add_formatting_status.sql')
const migrationSQL = readFileSync(migrationPath, 'utf-8')

console.log('🔄 Running migration: 20250116_001_add_formatting_status.sql')
console.log('')

try {
  // Execute migration using raw SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL })

  if (error) {
    // If rpc doesn't exist, try direct execution
    console.log('⚠️  RPC method not available, trying direct query...')

    const { error: directError } = await supabase
      .from('correspondence')
      .select('formatting_status')
      .limit(1)

    if (directError && directError.message.includes('column "formatting_status" does not exist')) {
      console.error('❌ Migration needs to be run manually in Supabase Dashboard')
      console.error('')
      console.error('Please run this SQL in your Supabase SQL Editor:')
      console.error('')
      console.error(migrationSQL)
      process.exit(1)
    } else if (!directError) {
      console.log('✅ Column already exists - migration already run!')
      process.exit(0)
    } else {
      throw directError
    }
  }

  console.log('✅ Migration completed successfully!')
  console.log('')
  console.log('Added:')
  console.log('  - formatting_status column to correspondence table')
  console.log('  - Index on formatting_status')
  console.log('  - Check constraint for valid values')

} catch (err) {
  console.error('❌ Error running migration:', err.message)
  console.error('')
  console.error('Please run this SQL manually in Supabase Dashboard:')
  console.error('')
  console.error(migrationSQL)
  process.exit(1)
}

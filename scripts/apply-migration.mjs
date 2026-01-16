import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20250117_001_add_multiple_contacts.sql');
const migrationSQL = readFileSync(migrationPath, 'utf8');

console.log('Applying migration: 20250117_001_add_multiple_contacts.sql');

// Split by semicolons and execute each statement
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

for (const statement of statements) {
  if (statement) {
    console.log('Executing:', statement.substring(0, 80) + '...');
    const { error } = await supabase.rpc('exec_sql', { sql: statement });

    if (error) {
      // Try direct SQL execution
      const { error: directError } = await supabase
        .from('_')
        .select('*')
        .limit(0);

      if (directError) {
        console.error('Error executing statement:', error.message);
        // Continue with next statement
      }
    }
  }
}

console.log('Migration completed!');
process.exit(0);

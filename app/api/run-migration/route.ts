import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { success: false, error: 'Missing Supabase credentials' },
        { status: 500 }
      );
    }

    // Create admin client with service role key
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Read migration file
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20250117_001_add_multiple_contacts.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    // Execute the migration SQL
    // Note: We'll execute it as a single transaction
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // If exec_sql doesn't exist, we need to run statements one by one
      // Split SQL into individual statements
      const statements = migrationSQL
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

      for (const statement of statements) {
        if (statement) {
          // For ALTER TABLE statements, we need to use the Postgres connection
          // This is a workaround - in production you'd use a proper migration tool
          const { error: stmtError } = await supabase.rpc('exec_sql', { sql: statement });

          if (stmtError) {
            console.error('Statement error:', stmtError);
            return NextResponse.json(
              {
                success: false,
                error: `Failed to execute statement: ${stmtError.message}. Please run the migration manually via Supabase dashboard.`,
              },
              { status: 500 }
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

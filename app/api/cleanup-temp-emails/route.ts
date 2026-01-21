import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// GET /api/cleanup-temp-emails
// Deletes expired temporary email data
// This can be called manually or via a cron job (e.g., Vercel Cron)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Delete expired records
    const { data, error } = await supabase
      .from('temporary_email_data')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select()

    if (error) {
      console.error('Cleanup failed:', error)
      return NextResponse.json(
        { error: 'Cleanup failed', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deletedCount: data?.length || 0,
      message: `Successfully deleted ${data?.length || 0} expired token(s)`
    })

  } catch (error) {
    console.error('Error in cleanup:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

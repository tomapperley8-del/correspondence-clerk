import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgIdForRoute } from '@/lib/auth-helpers'

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\r\n')
}

export async function GET(req: NextRequest) {
  const authResult = await requireOrgIdForRoute()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = await createClient()
  const type = req.nextUrl.searchParams.get('type')

  let csv = ''
  let filename = 'export.csv'

  if (type === 'businesses') {
    const { data, error } = await supabase
      .from('businesses')
      .select('name,category,status,membership_type,email,phone,address,notes,last_contacted_at,created_at')
      .eq('organization_id', orgId)
      .order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    csv = toCSV(data ?? [])
    filename = 'businesses.csv'
  } else if (type === 'contacts') {
    const { data, error } = await supabase
      .from('contacts')
      .select('name,role,emails,phones,notes,is_active,businesses(name),created_at')
      .eq('organization_id', orgId)
      .order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []).map(c => ({
      name: c.name,
      role: c.role,
      emails: Array.isArray(c.emails) ? c.emails.join('; ') : c.emails,
      phones: Array.isArray(c.phones) ? c.phones.join('; ') : c.phones,
      business: (c.businesses as { name?: string } | null)?.name ?? '',
      notes: c.notes,
      is_active: c.is_active,
      created_at: c.created_at,
    }))
    csv = toCSV(rows)
    filename = 'contacts.csv'
  } else if (type === 'correspondence') {
    const { data, error } = await supabase
      .from('correspondence')
      .select('entry_date,type,direction,subject,formatted_text_current,action_needed,due_at,businesses(name),contacts(name),created_at')
      .eq('organization_id', orgId)
      .order('entry_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []).map(c => ({
      entry_date: c.entry_date,
      type: c.type,
      direction: c.direction,
      subject: c.subject,
      business: (c.businesses as { name?: string } | null)?.name ?? '',
      contact: (c.contacts as { name?: string } | null)?.name ?? '',
      action_needed: c.action_needed,
      due_at: c.due_at,
      text: c.formatted_text_current,
      created_at: c.created_at,
    }))
    csv = toCSV(rows)
    filename = 'correspondence.csv'
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

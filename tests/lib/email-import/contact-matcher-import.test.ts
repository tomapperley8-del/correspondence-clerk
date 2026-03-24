import { describe, it, expect, vi } from 'vitest'
import { buildContactEmailMapDirect } from '@/lib/email-import/contact-matcher'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Returns a minimal Supabase mock where:
 *  - businesses query → returns the provided business rows
 *  - contacts query  → returns the provided contact rows
 */
function makeSupabaseMock(
  businessRows: { id: string }[],
  contactRows: { id: string; business_id: string; normalized_email: string | null; emails: string[] | string | null }[]
): SupabaseClient {
  const fromFn = vi.fn((table: string) => {
    if (table === 'businesses') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: businessRows, error: null }),
      }
    }
    if (table === 'contacts') {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: contactRows, error: null }),
      }
    }
    return {}
  })

  return { from: fromFn } as unknown as SupabaseClient
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('buildContactEmailMapDirect', () => {
  it('returns an empty map when the org has no businesses', async () => {
    const supabase = makeSupabaseMock([], [])
    const map = await buildContactEmailMapDirect(supabase, 'org-1')
    expect(map.size).toBe(0)
  })

  it('maps normalized_email to the correct businessId + contactId', async () => {
    const businesses = [{ id: 'biz-1' }]
    const contacts = [
      { id: 'c-1', business_id: 'biz-1', normalized_email: 'alice@acme.com', emails: [] },
    ]
    const supabase = makeSupabaseMock(businesses, contacts)

    const map = await buildContactEmailMapDirect(supabase, 'org-1')

    expect(map.get('alice@acme.com')).toEqual({ businessId: 'biz-1', contactId: 'c-1' })
  })

  it('also maps additional emails from the emails[] JSONB array', async () => {
    const businesses = [{ id: 'biz-1' }]
    const contacts = [
      {
        id: 'c-1',
        business_id: 'biz-1',
        normalized_email: 'alice@acme.com',
        emails: ['alice@acme.com', 'alice.smith@personal.com'],
      },
    ]
    const supabase = makeSupabaseMock(businesses, contacts)

    const map = await buildContactEmailMapDirect(supabase, 'org-1')

    expect(map.get('alice.smith@personal.com')).toEqual({ businessId: 'biz-1', contactId: 'c-1' })
  })

  it('handles emails stored as a JSON string (JSONB serialised)', async () => {
    const businesses = [{ id: 'biz-1' }]
    const contacts = [
      {
        id: 'c-1',
        business_id: 'biz-1',
        normalized_email: 'bob@corp.com',
        emails: JSON.stringify(['bob@corp.com', 'robert@corp.com']),
      },
    ]
    const supabase = makeSupabaseMock(businesses, contacts)

    const map = await buildContactEmailMapDirect(supabase, 'org-1')

    expect(map.get('robert@corp.com')).toEqual({ businessId: 'biz-1', contactId: 'c-1' })
  })

  it('normalises keys to lower-case (case-insensitive lookup)', async () => {
    const businesses = [{ id: 'biz-1' }]
    const contacts = [
      {
        id: 'c-1',
        business_id: 'biz-1',
        normalized_email: 'JOHN@ACME.COM',
        emails: [],
      },
    ]
    const supabase = makeSupabaseMock(businesses, contacts)

    const map = await buildContactEmailMapDirect(supabase, 'org-1')

    // The function stores normalized_email.toLowerCase() so the key is lowercase
    expect(map.has('john@acme.com')).toBe(true)
  })

  it('handles contacts with null normalized_email (skips null, still maps emails[])', async () => {
    const businesses = [{ id: 'biz-1' }]
    const contacts = [
      {
        id: 'c-1',
        business_id: 'biz-1',
        normalized_email: null,
        emails: ['backup@acme.com'],
      },
    ]
    const supabase = makeSupabaseMock(businesses, contacts)

    const map = await buildContactEmailMapDirect(supabase, 'org-1')

    expect(map.get('backup@acme.com')).toEqual({ businessId: 'biz-1', contactId: 'c-1' })
  })
})

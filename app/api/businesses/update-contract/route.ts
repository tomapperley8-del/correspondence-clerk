import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * API route to update business contract details
 * Used by Feature #7: Enhanced contract details UI
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { businessId, contract_start, contract_end, contract_amount, contract_currency, deal_terms, membership_type } = body

    if (!businessId) {
      return NextResponse.json(
        { error: 'businessId is required' },
        { status: 400 }
      )
    }

    // Validate dates if provided
    if (contract_start && contract_end) {
      const start = new Date(contract_start)
      const end = new Date(contract_end)
      if (end <= start) {
        return NextResponse.json(
          { error: 'Contract end date must be after start date' },
          { status: 400 }
        )
      }
    }

    // Validate amount if provided
    if (contract_amount !== null && contract_amount !== undefined) {
      if (isNaN(contract_amount) || contract_amount < 0) {
        return NextResponse.json(
          { error: 'Contract amount must be a positive number' },
          { status: 400 }
        )
      }
    }

    // Update business contract fields
    const updateData: Record<string, unknown> = {}

    if (contract_start !== undefined) updateData.contract_start = contract_start
    if (contract_end !== undefined) updateData.contract_end = contract_end
    if (contract_amount !== undefined) updateData.contract_amount = contract_amount
    if (contract_currency !== undefined) updateData.contract_currency = contract_currency
    if (deal_terms !== undefined) updateData.deal_terms = deal_terms
    if (membership_type !== undefined) updateData.membership_type = membership_type

    const { data, error } = await supabase
      .from('businesses')
      .update(updateData)
      .eq('id', businessId)
      .select()
      .single()

    if (error) {
      console.error('Error updating contract details:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Shared types for the Actions page and its hooks/components

export type CorrespondenceItem = {
  kind: 'correspondence'
  id: string
  business_id: string
  business_name: string
  contact_id: string | null
  contact_name: string | null
  contact_role: string | null
  subject: string | null
  action_needed: string
  due_at: string | null
  entry_date: string | null
  direction: string | null
  type: string | null
  snippet: string | null
  daysAgo?: number
}

export type BusinessItem = {
  kind: 'business'
  id: string
  business_id: string
  business_name: string
  last_contacted_at: string
  entry_count: number
}

export type ContractItem = {
  kind: 'contract'
  id: string
  business_id: string
  business_name: string
  contract_end: string
  contract_amount: number | null
  contract_currency: string | null
}

export type Badge =
  | 'REPLY'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_TOMORROW'
  | 'DUE_SOON'
  | 'FLAG'
  | 'RENEWAL'
  | 'QUIET'
  | 'REMINDER'

export type UnifiedItem = (CorrespondenceItem | BusinessItem | ContractItem) & {
  badge: Badge
  urgencyScore: number
  badgeLabel: string
}

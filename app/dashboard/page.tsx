import type { Metadata } from 'next'
import { getBusinesses } from '@/app/actions/businesses'

export const metadata: Metadata = {
  title: 'Dashboard — Correspondence Clerk',
}
import { getActiveMembershipTypes } from '@/app/actions/membership-types'
import { getActiveBusinessTypes } from '@/app/actions/business-types'
import { getHasAnyContact } from '@/app/actions/contacts'
import { DashboardClient } from '@/components/DashboardClient'

export default async function DashboardPage() {
  const [businessesResult, typesResult, bizTypesResult, hasContact] = await Promise.all([
    getBusinesses(),
    getActiveMembershipTypes(),
    getActiveBusinessTypes(),
    getHasAnyContact(),
  ])

  const businesses = 'error' in businessesResult ? [] : (businessesResult.data ?? [])
  const membershipTypes = 'error' in typesResult ? [] : (typesResult.data ?? [])
  const businessTypes = 'error' in bizTypesResult ? [] : (bizTypesResult.data ?? [])

  return (
    <DashboardClient
      initialBusinesses={businesses}
      initialMembershipTypes={membershipTypes}
      initialBusinessTypes={businessTypes}
      hasContact={hasContact}
    />
  )
}

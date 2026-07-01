import type { Metadata } from 'next'
import { getBusinesses } from '@/app/actions/businesses'

export const metadata: Metadata = {
  title: 'Businesses — Correspondence Clerk',
}
import { getActiveMembershipTypes } from '@/app/actions/membership-types'
import { getActiveBusinessTypes } from '@/app/actions/business-types'
import { getHasAnyContact } from '@/app/actions/contacts'
import { getRecentActivity, type RecentActivityItem } from '@/app/actions/correspondence'
import { DashboardClient } from '@/components/DashboardClient'

export default async function DashboardPage() {
  const [businessesResult, typesResult, bizTypesResult, hasContact, activityResult] = await Promise.all([
    getBusinesses(),
    getActiveMembershipTypes(),
    getActiveBusinessTypes(),
    getHasAnyContact(),
    getRecentActivity().catch(() => ({ data: [] })),
  ])

  const businesses = 'error' in businessesResult ? [] : (businessesResult.data ?? [])
  const membershipTypes = 'error' in typesResult ? [] : (typesResult.data ?? [])
  const businessTypes = 'error' in bizTypesResult ? [] : (bizTypesResult.data ?? [])
  const recentActivity = (activityResult as { data?: RecentActivityItem[] }).data ?? []

  return (
    <DashboardClient
      initialBusinesses={businesses}
      initialMembershipTypes={membershipTypes}
      initialBusinessTypes={businessTypes}
      hasContact={hasContact}
      initialActivity={recentActivity}
    />
  )
}

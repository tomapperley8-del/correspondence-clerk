import { getBusinesses } from '@/app/actions/businesses'
import { getActiveMembershipTypes } from '@/app/actions/membership-types'
import { getHasAnyContact } from '@/app/actions/contacts'
import { DashboardClient } from '@/components/DashboardClient'

export default async function DashboardPage() {
  const [businessesResult, typesResult, hasContact] = await Promise.all([
    getBusinesses(),
    getActiveMembershipTypes(),
    getHasAnyContact(),
  ])

  const businesses = 'error' in businessesResult ? [] : (businessesResult.data ?? [])
  const membershipTypes = 'error' in typesResult ? [] : (typesResult.data ?? [])

  return (
    <DashboardClient
      initialBusinesses={businesses}
      initialMembershipTypes={membershipTypes}
      hasContact={hasContact}
    />
  )
}

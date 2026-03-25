import { getBusinesses } from '@/app/actions/businesses'
import { getActiveMembershipTypes } from '@/app/actions/membership-types'
import { DashboardClient } from '@/components/DashboardClient'

export default async function DashboardPage() {
  const [businessesResult, typesResult] = await Promise.all([
    getBusinesses(),
    getActiveMembershipTypes(),
  ])

  const businesses = 'error' in businessesResult ? [] : (businessesResult.data ?? [])
  const membershipTypes = 'error' in typesResult ? [] : (typesResult.data ?? [])

  return (
    <DashboardClient
      initialBusinesses={businesses}
      initialMembershipTypes={membershipTypes}
    />
  )
}

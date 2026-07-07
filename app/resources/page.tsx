import { getResources } from '@/app/actions/resources'
import { getBusinesses } from '@/app/actions/businesses'
import { ResourcesClient } from './_components/ResourcesClient'

export default async function ResourcesPage() {
  const [resourcesResult, businessesResult] = await Promise.all([
    getResources(),
    getBusinesses().catch(() => ({ data: [] })),
  ])

  const businessNames = (businessesResult.data ?? []).map(b => ({ id: b.id, name: b.name }))

  return (
    <ResourcesClient
      initialResources={resourcesResult.data ?? []}
      initialError={resourcesResult.error ?? null}
      businessNames={businessNames}
    />
  )
}

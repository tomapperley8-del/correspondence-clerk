import { redirect } from 'next/navigation'
import { getBusinessById } from '@/app/actions/businesses'
import { getContactsByBusiness } from '@/app/actions/contacts'
import { findDuplicatesInBusiness, getOpenThreads } from '@/app/actions/correspondence'
import { getThreadsByBusiness } from '@/app/actions/threads'
import { getActiveMembershipTypes } from '@/app/actions/membership-types'
import { getRoutineDraftsForBusiness } from '@/app/actions/leads'
import { getOneOffSales } from '@/app/actions/contracts'
import { getBusinessGlance } from '@/app/actions/business-glance'
import { isAiEnabled } from '@/lib/ai/client'
import { BusinessDetailClient } from './_components/BusinessDetailClient'

export default async function BusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; from?: string; tab?: string }>
}) {
  const { id } = await params
  const { saved, from, tab } = await searchParams

  const [businessResult, contactsResult, duplicatesResult, threadsResult, membershipTypesResult, openThreadsResult, draftsResult, oneOffsResult, glanceResult] =
    await Promise.all([
      getBusinessById(id),
      getContactsByBusiness(id),
      findDuplicatesInBusiness(id),
      getThreadsByBusiness(id),
      getActiveMembershipTypes(),
      getOpenThreads({ businessId: id }),
      getRoutineDraftsForBusiness(id).catch(() => ({ data: [] })),
      getOneOffSales(id).catch(() => ({ data: [] })),
      getBusinessGlance(id).catch(() => ({ data: undefined })),
    ])

  if ('error' in businessResult || !businessResult.data) {
    redirect('/businesses')
  }

  return (
    <BusinessDetailClient
      business={businessResult.data}
      contacts={'error' in contactsResult ? [] : (contactsResult.data ?? [])}
      initialDuplicates={duplicatesResult.duplicates ?? []}
      initialThreads={'error' in threadsResult ? [] : (threadsResult.data ?? [])}
      membershipTypes={'error' in membershipTypesResult ? [] : (membershipTypesResult.data ?? [])}
      initialOpenThreads={'error' in openThreadsResult ? [] : (openThreadsResult.data ?? [])}
      businessId={id}
      routineDrafts={draftsResult.data ?? []}
      oneOffSales={oneOffsResult.data ?? []}
      initialGlance={glanceResult.data ?? null}
      aiEnabled={isAiEnabled()}
      saved={saved}
      fromTodos={from === 'todos'}
      initialTab={tab}
    />
  )
}

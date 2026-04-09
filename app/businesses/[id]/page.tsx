import { redirect } from 'next/navigation'
import { getBusinessById } from '@/app/actions/businesses'
import { getContactsByBusiness } from '@/app/actions/contacts'
import { findDuplicatesInBusiness } from '@/app/actions/correspondence'
import { getThreadsByBusiness } from '@/app/actions/threads'
import { getActiveMembershipTypes } from '@/app/actions/membership-types'
import { BusinessDetailClient } from './_components/BusinessDetailClient'

export default async function BusinessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; from?: string }>
}) {
  const { id } = await params
  const { saved, from } = await searchParams

  const [businessResult, contactsResult, duplicatesResult, threadsResult, membershipTypesResult] =
    await Promise.all([
      getBusinessById(id),
      getContactsByBusiness(id),
      findDuplicatesInBusiness(id),
      getThreadsByBusiness(id),
      getActiveMembershipTypes(),
    ])

  if ('error' in businessResult || !businessResult.data) {
    redirect('/dashboard')
  }

  return (
    <BusinessDetailClient
      business={businessResult.data}
      contacts={'error' in contactsResult ? [] : (contactsResult.data ?? [])}
      initialDuplicates={duplicatesResult.duplicates ?? []}
      initialThreads={'error' in threadsResult ? [] : (threadsResult.data ?? [])}
      membershipTypes={'error' in membershipTypesResult ? [] : (membershipTypesResult.data ?? [])}
      businessId={id}
      saved={saved}
      fromActions={from === 'actions'}
    />
  )
}

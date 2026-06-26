import { getTasks, getTaskCategories, migrateCrmRenewalDates } from '@/app/actions/tasks'
import { getNeedsReply, getGoneQuiet } from '@/app/actions/correspondence'
import type { GoneQuietItem } from '@/app/actions/correspondence'
import { getContractBusinesses, getBusinesses, getOutreachBusinesses } from '@/app/actions/businesses'
import { TodosClient } from './_components/TodosClient'

export default async function TodosPage() {
  await migrateCrmRenewalDates()
  const [result, categoriesResult, needsReply, goneQuiet, contractBiz, allBiz, outreachBiz] = await Promise.all([
    getTasks(),
    getTaskCategories(),
    getNeedsReply().catch(() => ({ data: [] })),
    getGoneQuiet().catch(() => ({ data: [] })),
    getContractBusinesses().catch(() => ({ data: [] })),
    getBusinesses().catch(() => ({ data: [] })),
    getOutreachBusinesses().catch(() => ({ data: [] })),
  ])

  const allBusinessNames = (allBiz.data ?? []).map(b => ({ id: b.id, name: b.name }))

  return (
    <TodosClient
      initialTasks={result.data ?? []}
      initialCategories={categoriesResult.data ?? []}
      initialError={result.error ?? null}
      initialNeedsReply={(needsReply as { data?: NeedsReplyItem[] }).data ?? []}
      initialGoneQuiet={(goneQuiet as { data?: GoneQuietItem[] }).data ?? []}
      initialContractBusinesses={contractBiz.data ?? []}
      initialOutreachBusinesses={outreachBiz.data ?? []}
      allBusinessNames={allBusinessNames}
    />
  )
}

export type NeedsReplyItem = {
  id: string
  business_id: string
  subject: string | null
  entry_date: string | null
  formatted_text_current: string | null
  businesses: { id: string; name: string }
  contact: { name: string; role: string | null } | null
}

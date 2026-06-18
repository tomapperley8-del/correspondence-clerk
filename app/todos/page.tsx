import { getTasks, migrateCrmRenewalDates } from '@/app/actions/tasks'
import { getNeedsReply } from '@/app/actions/correspondence'
import { TodosClient } from './_components/TodosClient'

export default async function TodosPage() {
  await migrateCrmRenewalDates()
  const [result, needsReply] = await Promise.all([
    getTasks(),
    getNeedsReply().catch(() => ({ data: [] })),
  ])

  return (
    <TodosClient
      initialTasks={result.data ?? []}
      initialError={result.error ?? null}
      initialNeedsReply={(needsReply as { data?: NeedsReplyItem[] }).data ?? []}
    />
  )
}

export type NeedsReplyItem = {
  id: string
  business_id: string
  subject: string | null
  entry_date: string | null
  businesses: { id: string; name: string }
  contact: { name: string; role: string | null } | null
}

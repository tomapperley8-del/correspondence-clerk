import { getTasks, migrateCrmRenewalDates } from '@/app/actions/tasks'
import { TodosClient } from './_components/TodosClient'

export default async function TodosPage() {
  await migrateCrmRenewalDates()
  const result = await getTasks()

  return (
    <TodosClient
      initialTasks={result.data ?? []}
      initialError={result.error ?? null}
    />
  )
}

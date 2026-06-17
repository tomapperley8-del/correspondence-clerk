import { getTasks } from '@/app/actions/tasks'
import { TodosClient } from './_components/TodosClient'

export default async function TodosPage() {
  const result = await getTasks()

  return (
    <TodosClient
      initialTasks={result.data ?? []}
      initialError={result.error ?? null}
    />
  )
}

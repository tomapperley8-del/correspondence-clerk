import { getOpenThreads } from '@/app/actions/correspondence'
import { OpenThreadsCard } from '@/components/OpenThreadsCard'

export async function OpenThreadsPanel() {
  const result = await getOpenThreads()
  const threads = 'error' in result ? [] : (result.data ?? [])

  if (threads.length === 0) return null

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-0">
      <OpenThreadsCard threads={threads} showBusinessName={true} />
    </div>
  )
}

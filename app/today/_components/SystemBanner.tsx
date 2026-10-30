import { cn } from '@/lib/utils'
import { KIND } from '@/components/ui/kind'
import type { SystemMiss } from '@/lib/today-source'

// Stage 18: shown only when a scheduled job or routine missed (system_alarm()). The same lines
// open the morning desk email. House style: the overdue colour, named, never colour alone.
export function SystemBanner({ misses }: { misses: SystemMiss[] }) {
  if (misses.length === 0) return null
  return (
    <div role="status" className={cn('mb-3 border-l-4 rounded-sm px-3 py-2 text-sm', KIND.overdue.edge, KIND.overdue.soft)}>
      <span className={cn('font-semibold', KIND.overdue.text)}>System: </span>
      <span className="text-brand-dark">
        {misses.map((m) => m.line).join('; ')}. Until it runs, lists that depend on it may be short.
      </span>
    </div>
  )
}

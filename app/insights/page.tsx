import type { Metadata } from 'next'
import { InsightsPanel } from '@/components/InsightsPanel'

export const metadata: Metadata = {
  title: 'Insights — Correspondence Clerk',
}

export default function InsightsPage() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <InsightsPanel inline={true} />
    </div>
  )
}

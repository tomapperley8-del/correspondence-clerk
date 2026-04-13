import type { Metadata } from 'next'
import { InsightsPanel } from '@/components/InsightsPanel'
import { OpenThreadsPanel } from './OpenThreadsPanel'

export const metadata: Metadata = {
  title: 'Insights — Correspondence Clerk',
}

export default function InsightsPage() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <OpenThreadsPanel />
      <InsightsPanel inline={true} />
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'

const InsightsPanel = dynamic(
  () => import('@/components/InsightsPanel').then((m) => ({ default: m.InsightsPanel })),
  { ssr: false }
)

const CommandSearch = dynamic(
  () => import('@/components/CommandSearch').then((m) => ({ default: m.CommandSearch })),
  { ssr: false }
)

export function DynamicPanels() {
  return (
    <>
      <InsightsPanel />
      <CommandSearch />
    </>
  )
}

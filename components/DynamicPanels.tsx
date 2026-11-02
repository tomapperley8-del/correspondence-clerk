'use client'

import dynamic from 'next/dynamic'

const CommandSearch = dynamic(
  () => import('@/components/CommandSearch').then((m) => ({ default: m.CommandSearch })),
  { ssr: false }
)

export function DynamicPanels() {
  return (
    <>
      <CommandSearch />
    </>
  )
}

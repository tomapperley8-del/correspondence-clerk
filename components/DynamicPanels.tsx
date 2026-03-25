'use client'

import dynamic from 'next/dynamic'

const ChatPanel = dynamic(
  () => import('@/components/ChatPanel').then((m) => ({ default: m.ChatPanel })),
  { ssr: false }
)

const CommandSearch = dynamic(
  () => import('@/components/CommandSearch').then((m) => ({ default: m.CommandSearch })),
  { ssr: false }
)

export function DynamicPanels() {
  return (
    <>
      <ChatPanel />
      <CommandSearch />
    </>
  )
}

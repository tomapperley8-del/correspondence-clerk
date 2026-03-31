'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

const ChatPanel = dynamic(
  () => import('@/components/ChatPanel').then((m) => ({ default: m.ChatPanel })),
  { ssr: false }
)

const InsightsPanel = dynamic(
  () => import('@/components/InsightsPanel').then((m) => ({ default: m.InsightsPanel })),
  { ssr: false }
)

const CommandSearch = dynamic(
  () => import('@/components/CommandSearch').then((m) => ({ default: m.CommandSearch })),
  { ssr: false }
)

export function DynamicPanels() {
  const pathname = usePathname()
  return (
    <>
      {pathname !== '/daily-briefing' && <ChatPanel />}
      {pathname !== '/insights' && <InsightsPanel />}
      <CommandSearch />
    </>
  )
}

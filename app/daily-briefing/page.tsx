import { ChatPanel } from '@/components/ChatPanel'

export default function DailyBriefingPage() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <ChatPanel inline={true} />
    </div>
  )
}

import type { Metadata } from 'next'
import { InsightsPanel } from '@/components/InsightsPanel'
import { OpenThreadsPanel } from './OpenThreadsPanel'
import { isAiEnabled } from '@/lib/ai/client'

export const metadata: Metadata = {
  title: 'Insights — Correspondence Clerk',
}

export default function InsightsPage() {
  const ai = isAiEnabled()
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <OpenThreadsPanel />
      {ai ? (
        <InsightsPanel inline={true} />
      ) : (
        <div className="max-w-2xl mx-auto px-6 py-10">
          <h2 className="text-lg font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>
            Insights are switched off
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            The app stopped making its own AI calls on 16 September 2026 (AI_ENABLED=false), so these
            panels would only show errors. The judgement work happens in the Claude routines instead:
            the morning desk run, the outreach drafts and the member care drafts, which all land in
            your Outlook and in the morning desk email.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            To bring them back, top up the Anthropic API account and set AI_ENABLED=true in Vercel.
          </p>
        </div>
      )}
    </div>
  )
}

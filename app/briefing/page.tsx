import Link from 'next/link'
import { getNewsLeads, getProspectLeads, getRoutineDrafts } from '@/app/actions/leads'
import { getTasks } from '@/app/actions/tasks'
import { getPinnedOrRecentResources } from '@/app/actions/resources'
import { CollapsibleBlock } from './_components/CollapsibleBlock'
import { NewsBoard } from './_components/NewsBoard'
import { ProspectBoard } from './_components/ProspectBoard'
import { TasksSection } from './_components/TasksSection'
import { DraftsSection } from './_components/DraftsSection'
import { ResourcesStrip } from './_components/ResourcesStrip'

export const dynamic = 'force-dynamic'

export default async function BriefingPage() {
  const [newsResult, prospectsResult, tasksResult, draftsResult, resources] = await Promise.all([
    getNewsLeads().catch(() => ({ data: [], error: 'Could not load news leads' })),
    getProspectLeads().catch(() => ({ data: [], error: 'Could not load prospect leads' })),
    getTasks().catch(() => ({ data: [] })),
    getRoutineDrafts().catch(() => ({ data: [] })),
    getPinnedOrRecentResources().catch(() => []),
  ])

  const newsLeads = newsResult.data ?? []
  const prospectLeads = prospectsResult.data ?? []
  const drafts = draftsResult.data ?? []

  // Tasks due today or overdue (open only), priority first
  const today = new Date().toISOString().slice(0, 10)
  const dueTasks = (tasksResult.data ?? [])
    .filter(t => t.status === 'open' && t.due_date !== null && t.due_date <= today)
    .sort((a, b) => {
      if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1
      return (a.due_date ?? '').localeCompare(b.due_date ?? '')
    })
    .slice(0, 10)

  const newNewsCount = newsLeads.filter(l => l.status === 'new').length
  const newProspectCount = prospectLeads.filter(l => l.status === 'new').length

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const dateLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-brand-paper">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>
            {greeting}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {dateLabel}
            {' — '}
            {newNewsCount > 0 || newProspectCount > 0 || dueTasks.length > 0 ? (
              <>
                {[
                  newNewsCount > 0 ? `${newNewsCount} new stor${newNewsCount === 1 ? 'y' : 'ies'}` : null,
                  newProspectCount > 0 ? `${newProspectCount} new prospect${newProspectCount === 1 ? '' : 's'}` : null,
                  dueTasks.length > 0 ? `${dueTasks.length} task${dueTasks.length === 1 ? '' : 's'} due` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </>
            ) : (
              'all quiet'
            )}
          </p>
        </div>

        <CollapsibleBlock
          title="Tasks Due"
          count={dueTasks.length}
          countHighlight
          linkHref="/todos"
          linkLabel="All to-dos"
          defaultOpen={dueTasks.length > 0}
        >
          <TasksSection initialTasks={dueTasks} />
        </CollapsibleBlock>

        <CollapsibleBlock
          title="News Leads"
          count={newsLeads.length}
          countHighlight={newNewsCount > 0}
          defaultOpen={newsLeads.length > 0}
        >
          {newsResult.error ? (
            <p className="text-sm text-red-700">{newsResult.error}</p>
          ) : newsLeads.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing new today — the news Routine hasn&apos;t found anything yet.</p>
          ) : (
            <NewsBoard initialLeads={newsLeads} />
          )}
        </CollapsibleBlock>

        <CollapsibleBlock
          title="Prospect Leads"
          count={prospectLeads.length}
          countHighlight={newProspectCount > 0}
          defaultOpen={prospectLeads.length > 0}
        >
          {prospectsResult.error ? (
            <p className="text-sm text-red-700">{prospectsResult.error}</p>
          ) : prospectLeads.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing new today — the prospecting Routine hasn&apos;t found anything yet.</p>
          ) : (
            <ProspectBoard initialLeads={prospectLeads} />
          )}
        </CollapsibleBlock>

        <CollapsibleBlock
          title="Drafts written for you"
          count={drafts.filter(d => d.outcome === 'drafted').length}
          countHighlight={drafts.some(d => d.outcome === 'drafted')}
          defaultOpen={drafts.length > 0}
        >
          <DraftsSection initialDrafts={drafts} />
        </CollapsibleBlock>

        <CollapsibleBlock
          title="Resources"
          count={resources.length}
          linkHref="/resources"
          linkLabel="Resource Hub"
          defaultOpen={resources.length > 0}
        >
          <ResourcesStrip resources={resources} />
        </CollapsibleBlock>

        <p className="text-xs text-gray-400 text-center pb-4">
          <Link href="/todos" className="text-brand-navy hover:text-brand-olive font-medium transition-colors">
            Go to To-dos →
          </Link>
        </p>
      </div>
    </div>
  )
}

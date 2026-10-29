'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { cn, formatDateGB } from '@/lib/utils'
import type { OutreachTabData, OutreachTabRow } from '@/app/actions/outreach-tab'
import type { ProspectLead } from '@/app/actions/leads'
import { acceptProspectLead, deleteProspectLead, undoDeleteProspectLead } from '@/app/actions/leads'
import { removeBusinessFromOutreach, undoRemoveFromOutreach, updateOutreachStage } from '@/app/actions/businesses'
import { MATCH_TYPE_META } from '@/lib/lead-meta'
import { ActionMenu } from '@/components/ui/action-menu'
import { FullScreenPanel } from '@/components/ui/full-screen-panel'
import { PipelineBoard } from '@/components/pipeline/PipelineBoards'
import { OUTREACH_STAGES, PILL } from '@/app/businesses/_components/MastersheetTable'
import { downloadSheet } from '@/lib/spreadsheet-export'
import type { OutreachNextRow, OutreachSuggestion } from '@/app/actions/outreach-next'
import { WorkOnNext } from './WorkOnNext'
import { OutreachSuggestions } from './OutreachSuggestions'

// The Outreach tab (UI overhaul Stage 16c; laid out again in 16c3, layout A,
// Tom's pick on 29 Oct): a workspace. The title with a summary strip whose
// numbers jump to their part; Work on next as the main column; a side rail with
// the outreach routine's drafts, leads to accept, suggestions and results by
// month; the pipeline as one strip of stages that opens a stage's list (or the
// board). Stage moves use the Outreach
// board's own actions, so the spreadsheet column, the leads mirror and the
// outreach routine see them. Nothing is sent from here.

const OUTLOOK_DRAFTS = 'https://outlook.office.com/mail/drafts'
const LEADS_FIRST = 4

/** The six boxes. Invoice paid is counted with Won. */
const BOXES = OUTREACH_STAGES.filter((s) => s.key !== 'invoice_paid')
const boxOf = (stage: string) => (stage === 'invoice_paid' ? 'won' : stage)
const stageDef = (key: string) => OUTREACH_STAGES.find((s) => s.key === key)

const btnBase =
  'inline-flex items-center justify-center text-sm font-semibold px-3 min-h-10 md:min-h-9 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const mainBtn = `${btnBase} bg-ms-band text-white hover:bg-ms-band-hover`
const softBtn = `${btnBase} bg-white border border-black/[0.12] text-brand-dark hover:bg-brand-warm`
const card = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'

const dateGB = (d: string | null | undefined) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function contactName(r: OutreachTabRow) {
  const c = r.table?.contact
  if (!c || c.is_placeholder) return ''
  return c.role ? `${c.name} (${c.role})` : c.name
}

function todoText(r: OutreachTabRow) {
  const t = r.table?.next_todo
  if (!t) return ''
  return [t.due_date ? dateGB(t.due_date) : null, t.title, t.more ? `+${t.more}` : null].filter(Boolean).join(' ')
}

function todoTone(r: OutreachTabRow, today: string) {
  const due = r.table?.next_todo?.due_date
  if (!due) return ''
  if (due < today) return 'text-ms-red-text font-semibold'
  if (due <= addDaysISO(today, 7)) return 'text-ms-orange-text font-semibold'
  return ''
}

export function OutreachTab({ data, next, nextError, initialStage, initialBoard, initialQuery }: {
  data: OutreachTabData
  next: { rows: OutreachNextRow[]; suggestions: OutreachSuggestion[] } | null
  nextError?: string
  initialStage?: string
  initialBoard?: boolean
  initialQuery?: string
}) {
  const router = useRouter()
  const { today, summary, months, drafts } = data
  const [leads, setLeads] = useState<ProspectLead[]>(data.leads)
  const [busyLead, setBusyLead] = useState<string | null>(null)
  // Stage moves made here, shown at once; null = taken off outreach.
  const [moved, setMoved] = useState<Record<string, string | null>>({})
  const [stage, setStage] = useState(() => (BOXES.some((b) => b.key === initialStage) ? initialStage! : 'in_discussion'))
  const [board, setBoard] = useState(!!initialBoard)
  const [q, setQ] = useState(initialQuery ?? '')
  // A stage's list opens when one is chosen (or the address names one), so the page stays short.
  const [listOpen, setListOpen] = useState(!!initialStage || !!initialQuery)
  const [leadsShown, setLeadsShown] = useState(LEADS_FIRST)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- take the fresh list after router.refresh()
  useEffect(() => setLeads(data.leads), [data.leads])

  // Keep the stage, board and search in the address, so it can be bookmarked or shared.
  useEffect(() => {
    const params = new URLSearchParams()
    if (board) params.set('board', '1')
    else if (listOpen) params.set('stage', stage)
    if (q && !board && listOpen) params.set('q', q)
    const s = params.toString()
    window.history.replaceState(null, '', s ? `/outreach?${s}` : '/outreach')
  }, [stage, board, q, listOpen])

  const rows = useMemo(
    () => data.rows
      .filter((r) => moved[r.id] !== null)
      .map((r) => (moved[r.id] ? { ...r, stage: moved[r.id] as string, since: today } : r)),
    [data.rows, moved, today],
  )
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rows) c[boxOf(r.stage)] = (c[boxOf(r.stage)] ?? 0) + 1
    return c
  }, [rows])
  const biggest = Math.max(1, ...BOXES.map((b) => counts[b.key] ?? 0))
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) => boxOf(r.stage) === stage && (!needle || r.name.toLowerCase().includes(needle) || contactName(r).toLowerCase().includes(needle)))
      .sort((a, b) => (b.table?.last_in_touch ?? '').localeCompare(a.table?.last_in_touch ?? '') || a.name.localeCompare(b.name, 'en-GB'))
  }, [rows, stage, q])
  const contacts = useMemo(() => new Map(data.rows.map((r) => [r.id, r.table?.contact ?? null])), [data.rows])
  const allBusinessNames = useMemo(() => data.rows.map((r) => ({ id: r.id, name: r.name })), [data.rows])

  async function accept(lead: ProspectLead) {
    setBusyLead(lead.id)
    const result = await acceptProspectLead(lead.id)
    setBusyLead(null)
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Not accepted')
      return
    }
    setLeads((l) => l.filter((x) => x.id !== lead.id))
    toast.success(result.data.created ? `${result.data.business_name} added, on outreach as Identified` : `Linked to ${result.data.business_name}`)
    router.refresh()
  }

  async function remove(lead: ProspectLead) {
    setBusyLead(lead.id)
    const result = await deleteProspectLead(lead.id)
    setBusyLead(null)
    if (result.error || result.backupId === undefined) {
      toast.error(result.error ?? 'Not deleted')
      return
    }
    const backupId = result.backupId
    setLeads((l) => l.filter((x) => x.id !== lead.id))
    toast.undo(`Deleted lead: ${lead.business_name}`, async () => {
      const undo = await undoDeleteProspectLead(backupId)
      if (undo.error) toast.error(undo.error)
      else {
        toast.success('Put back')
        router.refresh()
      }
    })
  }

  async function changeStage(r: OutreachTabRow, next: string) {
    if (next === r.stage) return
    const before = moved[r.id]
    if (next === '') {
      setMoved((m) => ({ ...m, [r.id]: null }))
      const result = await removeBusinessFromOutreach(r.id)
      if (result.error || result.backupId === undefined) {
        setMoved((m) => ({ ...m, [r.id]: before }))
        toast.error(result.error ?? 'Not taken off outreach')
        return
      }
      const backupId = result.backupId
      toast.undo(`${r.name} taken off outreach`, async () => {
        const undo = await undoRemoveFromOutreach(backupId)
        if (undo.error) toast.error(undo.error)
        else {
          setMoved((m) => ({ ...m, [r.id]: before }))
          toast.success('Put back')
        }
      })
      return
    }
    setMoved((m) => ({ ...m, [r.id]: next }))
    const result = await updateOutreachStage(r.id, next)
    if (result.error) {
      setMoved((m) => ({ ...m, [r.id]: before }))
      toast.error(result.error)
      return
    }
    toast.success(`${r.name}: ${stageDef(next)?.label ?? next}`)
  }

  function download(format: 'csv' | 'xlsx') {
    downloadSheet(
      {
        name: 'Outreach',
        header: ['Business', 'Stage', 'Since', 'Last in touch', 'Main contact', 'Email', 'Next to-do'],
        rows: shown.map((r) => [r.name, stageDef(r.stage)?.label ?? r.stage, dateGB(r.since), dateGB(r.table?.last_in_touch), contactName(r), r.table?.contact?.email ?? '', todoText(r)]),
      },
      `outreach-${stage}-${today}`,
      format,
    )
  }

  const openStage = (key: string) => {
    setBoard(false)
    setStage(key)
    setListOpen(true)
  }
  // In-page links, so the browser does the scrolling; In discussion also opens that stage's list.
  const tiles: { label: string; value: number; href: string; go?: () => void; target: string }[] = [
    { label: 'On outreach', value: summary.onOutreach, href: '#pipeline', target: 'the pipeline' },
    { label: `Contacted in ${summary.thisMonthLabel}`, value: summary.contactedThisMonth, href: '#results', target: 'results by month' },
    { label: 'In discussion', value: counts.in_discussion ?? 0, href: '#pipeline', go: () => openStage('in_discussion'), target: 'the businesses in discussion' },
    { label: `Won in ${summary.year}`, value: summary.wonThisYear, href: '#results', target: 'results by month' },
    { label: 'Leads to look at', value: leads.length, href: '#leads', target: 'the leads' },
  ]

  return (
    <div className="space-y-5">
      {/* Title and the summary strip; each number jumps to its part of the page */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-0.5" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
            Outreach
          </h1>
          <p className="text-sm text-gray-600">New business: who to approach, who you are talking to, and how it is going.</p>
        </div>
        <div className={cn(card, 'grid grid-cols-3 sm:flex sm:flex-wrap divide-x divide-black/[0.06] w-full sm:w-auto')}>
          {tiles.map((t) => (
            <a
              key={t.label}
              href={t.href}
              onClick={t.go}
              className="block text-left px-3 py-1.5 hover:bg-brand-warm transition-colors duration-200 ease-out min-w-0"
            >
              <span className="block text-xl font-bold tabular-nums text-brand-dark">{t.value}</span>
              <span className="block text-xs font-semibold text-gray-700">{t.label}</span>
              <span className="sr-only">, go to {t.target}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        {/* Main column: what to do */}
        <div className="flex-[999_1_620px] min-w-0">
          {next ? (
            <WorkOnNext rows={next.rows} contacts={contacts} />
          ) : (
            <p className="text-sm text-red-700">Could not load Work on next: {nextError ?? 'no data'}</p>
          )}
        </div>

        {/* Side rail: what to send, what to bring in, how it is going */}
        <aside aria-label="Drafts, leads, suggestions and results" className="flex-[1_1_400px] min-w-0 space-y-4">
          <section aria-labelledby="drafts-heading" className={card}>
            <RailHead id="drafts-heading" title="Drafts ready to send" count={drafts.length}>
              {drafts.length > 0 && (
                <a href={OUTLOOK_DRAFTS} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-navy hover:underline">
                  Open Outlook drafts<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </RailHead>
            <p className="px-3 pb-1.5 text-xs text-gray-600">Written by the outreach routine in the last 30 days, waiting in your Outlook drafts. Nothing is sent from here.</p>
            <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
              {drafts.length === 0 && <li className="px-3 py-2.5 text-sm text-gray-600">No outreach drafts waiting.</li>}
              {drafts.map((d) => (
                <li key={d.id} className="px-3 py-2 flex gap-2 items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-dark break-words">{d.business?.name ?? d.recipient ?? 'No business'}</p>
                    <p className="text-xs text-gray-600 break-words line-clamp-2" title={d.subject ?? undefined}>
                      {[`written ${dateGB(d.created_at)}`, d.recipient && d.business ? `to ${d.recipient}` : null, d.subject].filter(Boolean).join(' · ')}
                    </p>
                    {d.reason && <p className="text-xs text-gray-700 mt-0.5 line-clamp-1" title={d.reason}>{d.reason}</p>}
                  </div>
                  {d.business && (
                    <Link href={`/businesses/${d.business.id}`} className={softBtn}>
                      Business<span className="sr-only"> page for {d.business.name}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section id="leads" aria-labelledby="leads-heading" className={cn(card, 'scroll-mt-4')}>
            <RailHead id="leads-heading" title="Leads to accept" count={leads.length} />
            <p className="px-3 pb-1.5 text-xs text-gray-600">Found by the prospecting routine. Accept puts the business on outreach as Identified (or links it to the one on file); Delete removes the lead, with Undo.</p>
            <ul className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
              {leads.length === 0 && <li className="px-3 py-2.5 text-sm text-gray-600">No leads waiting. The prospecting routine adds them here when it finds something.</li>}
              {leads.slice(0, leadsShown).map((l) => {
                const meta = MATCH_TYPE_META[l.match_type]
                return (
                  <li key={l.id} className="px-3 py-2 space-y-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-dark break-words">
                        {l.business_name}
                        {meta && <span className={cn('ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-full align-middle', meta.badge)}>{meta.label}</span>}
                      </p>
                      <p className="text-xs text-gray-600 break-words">
                        {[l.business_category, l.address, `found ${dateGB(l.found_at)}`].filter(Boolean).join(' · ')}
                        {l.source_url && (
                          <>
                            {' · '}
                            <a href={l.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline">
                              {l.source_name || 'Source'}<span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          </>
                        )}
                      </p>
                      {(l.opportunity_notes || l.snippet) && <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{l.opportunity_notes || l.snippet}</p>}
                      {l.matched_business && (
                        <p className="text-xs mt-0.5">
                          On file:{' '}
                          <Link href={`/businesses/${l.matched_business.id}`} className="font-semibold text-brand-navy hover:underline">{l.matched_business.name}</Link>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" className={mainBtn} disabled={busyLead === l.id} onClick={() => accept(l)}>
                        Accept<span className="sr-only"> {l.business_name}</span>
                      </button>
                      <button type="button" className={softBtn} disabled={busyLead === l.id} onClick={() => remove(l)}>
                        Delete<span className="sr-only"> lead {l.business_name}</span>
                      </button>
                    </div>
                  </li>
                )
              })}
              {leads.length > leadsShown && (
                <li className="px-3 py-1.5">
                  <button type="button" className="text-sm font-semibold text-brand-navy hover:underline min-h-10 md:min-h-0" onClick={() => setLeadsShown(leads.length)}>
                    Show all {leads.length} leads
                  </button>
                </li>
              )}
              {summary.leadsAccepted > 0 && (
                <li className="px-3 py-2 text-xs text-gray-600">
                  {summary.leadsAccepted} accepted {summary.leadsAccepted === 1 ? 'lead is' : 'leads are'} already on the pipeline as businesses.
                </li>
              )}
            </ul>
          </section>

          {next && <OutreachSuggestions suggestions={next.suggestions} />}

          <section id="results" aria-labelledby="results-heading" className={cn(card, 'scroll-mt-4')}>
            <RailHead id="results-heading" title="Results by month" />
            <p className="px-3 text-xs text-gray-600">Contacted = the first approach that month. Replied = they emailed back within 30 days of it. Won = a deal recorded that month.</p>
            <ResultsChart months={months} />
          </section>
        </aside>
      </div>

      {/* Pipeline: one strip of stages; a stage opens its list, or use the board */}
      <section id="pipeline" aria-labelledby="outreach-pipeline-heading" className="scroll-mt-4">
        <FullScreenPanel
          title="Pipeline"
          headingId="outreach-pipeline-heading"
          card={false}
          controls={
            board || !listOpen ? null : (
              <ActionMenu
                label="Download"
                accessibleLabel={`Download ${shown.length} businesses at this stage`}
                className="text-brand-navy"
                entries={[
                  { label: 'Excel (.xlsx)', hint: 'The businesses listed, all of them', onSelect: () => download('xlsx') },
                  { label: 'CSV', hint: 'Opens in Excel, Numbers or Google Sheets', onSelect: () => download('csv') },
                ]}
              />
            )
          }
        >
          {(full) => (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <p className="text-xs text-gray-600 flex-1 min-w-[220px]">
                  Each business&apos;s outreach stage, the same one as the Outreach stage column in Businesses. Choose a stage to list its businesses, or use the board to drag.
                </p>
                <div className="inline-flex border border-black/10 rounded-sm overflow-hidden" role="group" aria-label="Show as">
                  {([['list', 'Stages'], ['board', 'Board']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={(key === 'board') === board}
                      onClick={() => {
                        if (board && key === 'list') router.refresh()
                        setBoard(key === 'board')
                      }}
                      className={cn(
                        'px-3 min-h-10 md:min-h-8 text-sm transition-colors duration-200 ease-out',
                        (key === 'board') === board ? 'bg-brand-navy text-white' : 'bg-white text-gray-800 hover:bg-brand-warm',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {board ? (
                <PipelineBoard kind="outreach" allBusinessNames={allBusinessNames} />
              ) : (
                <>
                  <div role="group" aria-label="Outreach stages" className={cn(card, 'grid grid-cols-3 sm:grid-cols-6 divide-x divide-black/[0.06] mb-3 overflow-hidden')}>
                    {BOXES.map((b) => {
                      const n = counts[b.key] ?? 0
                      const on = listOpen && b.key === stage
                      return (
                        <button
                          key={b.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => (on ? setListOpen(false) : openStage(b.key))}
                          className={cn(
                            'text-left px-3 py-2 transition-colors duration-200 ease-out border-b-[3px]',
                            on ? 'border-b-ms-band bg-brand-warm' : 'border-b-transparent hover:bg-brand-warm',
                          )}
                        >
                          <span className={cn('inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded-full', PILL[b.tone])}>{b.label}</span>
                          <span className="block text-xl font-bold tabular-nums text-brand-dark mt-0.5">{n}</span>
                          <span className="block h-1 rounded-sm bg-ms-muted overflow-hidden mt-1" aria-hidden="true">
                            <span className="block h-full bg-ms-band" style={{ width: `${Math.max(2, (n / biggest) * 100)}%` }} />
                          </span>
                          {on && <span className="sr-only"> (listed below; choose again to hide)</span>}
                        </button>
                      )
                    })}
                  </div>

                  {listOpen && (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <label className="block flex-1 max-w-sm">
                          <span className="sr-only">Search this stage</span>
                          <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search names and contacts"
                            className="w-full text-sm border border-black/[0.12] rounded-sm px-2 min-h-10 md:min-h-8 bg-white"
                          />
                        </label>
                        <button type="button" className={softBtn} onClick={() => setListOpen(false)}>Hide the list</button>
                      </div>

                      {shown.length === 0 ? (
                        <p className="text-sm text-gray-600 py-4">Nobody at this stage{q ? ' matches the search' : ''}.</p>
                      ) : (
                        <div className={cn('overflow-auto border border-ms-grid rounded-sm bg-white', full ? 'max-h-[calc(100vh-16rem)]' : 'max-h-[60vh]')}>
                          <table className="w-full min-w-[720px] text-[13px] border-collapse">
                            <caption className="sr-only">Businesses at the stage {stageDef(stage)?.label}, most recently in touch first.</caption>
                            <thead>
                              <tr>
                                {['Business', 'Stage', 'Since', 'Last in touch', 'Main contact', 'Next to-do'].map((h, i) => (
                                  <th
                                    key={h}
                                    scope="col"
                                    className={cn('sticky top-0 bg-ms-header text-white text-left font-semibold px-2 py-1.5 whitespace-nowrap', i === 0 ? 'left-0 z-20' : 'z-10')}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {shown.map((r) => (
                                <tr key={r.id} className="border-t border-ms-grid align-top hover:bg-brand-warm">
                                  <th scope="row" className="sticky left-0 z-[5] bg-white text-left font-semibold px-2 py-1.5 max-w-[240px]">
                                    <Link href={`/businesses/${r.id}`} className="text-brand-dark hover:underline">{r.name}</Link>
                                  </th>
                                  <td className="px-2 py-1">
                                    <label>
                                      <span className="sr-only">Outreach stage for {r.name}</span>
                                      <select
                                        value={r.stage}
                                        onChange={(e) => changeStage(r, e.target.value)}
                                        className="text-xs border border-black/[0.12] rounded-sm bg-white px-1 min-h-10 md:min-h-7"
                                      >
                                        {OUTREACH_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                        <option value="">Take off outreach</option>
                                      </select>
                                    </label>
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{dateGB(r.since)}</td>
                                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{dateGB(r.table?.last_in_touch)}</td>
                                  <td className="px-2 py-1.5">
                                    {contactName(r)}
                                    {r.table?.contact?.email && !r.table.contact.is_placeholder && (
                                      <a href={`mailto:${r.table.contact.email}`} className="block text-xs text-brand-navy hover:underline break-all">{r.table.contact.email}</a>
                                    )}
                                  </td>
                                  <td className={cn('px-2 py-1.5', todoTone(r, today))}>{todoText(r)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="text-xs text-gray-600 mt-2">
                        {shown.length} {shown.length === 1 ? 'business' : 'businesses'}. To-do dates in <span className="text-ms-red-text font-semibold">red</span> have passed; <span className="text-ms-orange-text font-semibold">orange</span> are due within a week. A name opens the business page.
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </FullScreenPanel>
      </section>
    </div>
  )
}

function RailHead({ id, title, count, children }: { id: string; title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-2.5 pb-0.5">
      <h2 id={id} className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>
        {title}
        {count !== undefined && <span className="ml-1.5 text-xs font-semibold text-gray-600 tabular-nums" style={{ fontFamily: 'var(--font-sans)' }}>{count}</span>}
      </h2>
      {children}
    </div>
  )
}

function ResultsChart({ months }: { months: OutreachTabData['months'] }) {
  const W = 600
  const H = 190
  const pad = 30
  const series = [
    { key: 'contacted', label: 'Contacted', cls: 'fill-brand-navy', swatch: 'bg-brand-navy' },
    { key: 'replied', label: 'Replied', cls: 'fill-brand-olive', swatch: 'bg-brand-olive' },
    { key: 'won', label: 'Won', cls: 'fill-ms-band', swatch: 'bg-ms-band' },
  ] as const
  const max = Math.max(5, ...months.flatMap((m) => [m.contacted, m.replied, m.won]))
  const step = max <= 10 ? 5 : max <= 40 ? 10 : 20
  const top = Math.ceil(max / step) * step
  const y = (v: number) => H - 24 - (v / top) * (H - 44)
  const slot = (W - pad * 2) / Math.max(1, months.length)
  const bar = slot * 0.22
  const ticks: number[] = []
  for (let t = 0; t <= top; t += step) ticks.push(t)
  const first = months[0]?.label
  const last = months[months.length - 1]?.label

  return (
    <div className={cn(card, 'p-3')}>
      <div className="flex flex-wrap gap-4 text-xs text-gray-700 mb-1">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-block w-2.5 h-2.5 rounded-sm', s.swatch)} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[340px]" role="img" aria-label={`Contacted, replied and won by month, ${first} to ${last}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} className="stroke-black/10" />
              <text x={pad - 6} y={y(t) + 4} fontSize="10" textAnchor="end" className="fill-gray-500">{t}</text>
            </g>
          ))}
          {months.map((m, i) => {
            const x0 = pad + i * slot + slot * 0.17
            return (
              <g key={m.month}>
                {series.map((s, j) => {
                  const v = m[s.key]
                  const x = x0 + j * bar
                  return (
                    <g key={s.key}>
                      <rect x={x} y={y(v)} width={bar - 2} height={Math.max(0, H - 24 - y(v))} className={s.cls}>
                        <title>{`${m.label}: ${v} ${s.label.toLowerCase()}`}</title>
                      </rect>
                      {v > 0 && <text x={x + (bar - 2) / 2} y={y(v) - 3} fontSize="10" textAnchor="middle" className="fill-gray-800">{v}</text>}
                    </g>
                  )
                })}
                <text x={pad + i * slot + slot / 2} y={H - 7} fontSize="11" textAnchor="middle" className="fill-gray-600">{m.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
      {/* The same numbers as a table, for screen readers and anyone who prefers one */}
      <table className="sr-only">
        <caption>Results by month</caption>
        <thead><tr><th scope="col">Month</th>{series.map((s) => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><th scope="row">{m.label}</th><td>{m.contacted}</td><td>{m.replied}</td><td>{m.won}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

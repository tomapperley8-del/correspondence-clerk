'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn, formatDateGB } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { FilterChips } from '@/components/ui/filter-chips'
import { FoldSection } from '@/components/ui/fold-section'
import { addToNewsletter } from '@/components/ForNewsletterButton'
import type { ItemKind } from '@/lib/newsletter/items'
import { nthWednesday, weekWords } from '@/lib/newsletter/rhythm'
import {
  addPromise, decideMention, deleteContributor, deletePromise, saveContributor, setPromiseTick, updateNewsletterItem,
  type ContributorInput, type NewsletterTabData, type NlContributor, type NlItem, type NlPromise,
} from '@/app/actions/newsletter-tab'
import {
  deleteNewsletterItem, markNewsletterUsed, moveNewsletterItem, undoDeleteNewsletterItem, type NewsletterItem,
} from '@/app/actions/calendar'

// The Newsletter tab (UI overhaul Stage 16a, layout B, Tom's pick on 29 Oct):
// a strip of Wednesdays (the next issue first), then views. The next issue's
// list is Today's list (one source); everything else is read from the issues.
// Tom can change any item's kind, business or contributor; the weekly read
// then keeps his choice.

type View = 'issue' | 'contributors' | 'freebies' | 'club_card' | 'promises' | 'markets' | 'items' | 'check'

const VIEWS: { key: View; label: string }[] = [
  { key: 'issue', label: 'This issue' },
  { key: 'contributors', label: 'Contributors' },
  { key: 'freebies', label: 'Freebies and competitions' },
  { key: 'club_card', label: 'Club Card' },
  { key: 'promises', label: 'Deal promises' },
  { key: 'markets', label: 'Markets and regulars' },
  { key: 'items', label: 'Every item' },
  { key: 'check', label: 'To check' },
]

export const KIND_LABEL: Record<ItemKind, string> = {
  news: 'News', more_news: 'More news', feature: 'Feature', guest_blog: 'Guest blog', column: 'Column', review: 'Review',
  freebie: 'Freebie', competition: 'Competition', club_card_join: 'Club Card: joins', club_card_offer: 'Club Card: offer',
  club_card_event: 'Club Card: event', market: 'Market', whats_on: "What's on", jazz: 'Jazz', banner: 'Banner ad', appeal: 'Appeal', other: 'Other',
}
const KINDS = Object.keys(KIND_LABEL) as ItemKind[]

const SECTION_LABEL: Record<string, string> = {
  top: 'Lead stories', more_news: 'More news', features: 'Features', club_card: 'Club Card', whats_on: "What's on",
  jazz: 'Jazz at George IV', columnists: 'Columnists', footer: 'Appeal',
}

const PROMISE_WORD: Record<NlPromise['kind'], [string, string]> = {
  blog: ['blog', 'blogs'], editorial: ['editorial', 'editorials'], banner: ['banner', 'banners'], ad: ['ad', 'ads'], mention: ['mention', 'mentions'],
}

const card = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'
const btn = 'inline-flex items-center px-2.5 min-h-10 md:min-h-8 text-sm rounded-sm border border-black/10 bg-white hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const mainBtn = 'inline-flex items-center px-2.5 min-h-10 md:min-h-8 text-sm rounded-sm bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'
const input = 'border border-black/15 rounded-sm px-2 min-h-10 md:min-h-8 text-sm bg-white min-w-0'
const pill = 'text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap'

const dateGB = (d: string | null | undefined) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')
const shortGB = (d: string) => dateGB(d).slice(0, 5)
function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const weekdayGB = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function NewsletterTab({ data, next, initialView, initialIssue }: {
  data: NewsletterTabData
  next: { wednesday: string; items: NewsletterItem[] }
  initialView?: string
  initialIssue?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [view, setView] = useState<View>(VIEWS.some((v) => v.key === initialView) ? (initialView as View) : 'issue')
  const [issueId, setIssueId] = useState<string>(initialIssue && data.issues.some((i) => i.id === initialIssue) ? initialIssue : 'next')

  useEffect(() => {
    const params = new URLSearchParams()
    if (view !== 'issue') params.set('view', view)
    if (issueId !== 'next' && view === 'issue') params.set('issue', issueId)
    const s = params.toString()
    window.history.replaceState(null, '', s ? `/newsletter?${s}` : '/newsletter')
  }, [view, issueId])

  /** Run a write, say how it went, and reload the page's data. */
  function run(fn: () => Promise<{ error?: string }>, done: string) {
    startTransition(async () => {
      const r = await fn()
      if (r.error) toast.error(r.error)
      else { toast.success(done); router.refresh() }
    })
  }

  const contributorsById = useMemo(() => new Map(data.contributors.map((c) => [c.id, c])), [data.contributors])
  const issueDates = useMemo(() => new Map(data.issues.map((i) => [i.id, i.date])), [data.issues])
  const counts: Record<View, number> = {
    issue: issueId === 'next' ? next.items.length : data.items.filter((i) => i.issue_id === issueId).length,
    contributors: data.contributors.filter((c) => c.active).length,
    freebies: data.items.filter((i) => i.kind === 'freebie' || i.kind === 'competition').length,
    club_card: data.queue.filter((q) => q.deal === 'club_card').length,
    promises: data.promises.length,
    markets: data.items.filter((i) => i.kind === 'market').length,
    items: data.items.length,
    check: data.toCheck.length,
  }
  const ctx: Ctx = { data, run, pending, contributorsById, issueDates }
  const latest = data.issues[0]

  return (
    <div>
      <p className="text-sm text-gray-700 mb-3">
        <b>{data.issues.length}</b> issues held{data.issues.length > 0 && <>, {dateGB(data.issues[data.issues.length - 1].date)} to {dateGB(latest.date)}</>}
        {' · '}<b>{data.items.length.toLocaleString('en-GB')}</b> items
        {' · '}next issue <b>{weekdayGB(next.wednesday)}</b>, {next.items.length} on the list
        {data.toCheck.length > 0 && <> · <button type="button" className="text-brand-navy hover:underline" onClick={() => setView('check')}>{data.toCheck.length} mentions to check</button></>}
      </p>

      {/* The strip of Wednesdays */}
      <div role="group" aria-label="Issues" className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
        <IssueButton on={issueId === 'next'} dashed onClick={() => { setIssueId('next'); setView('issue') }}
          title={`Next · ${weekdayGB(next.wednesday)}`} sub={`${next.items.length} on the list`} />
        {data.issues.map((i) => (
          <IssueButton key={i.id} on={issueId === i.id} onClick={() => { setIssueId(i.id); setView('issue') }}
            title={shortGB(i.date)} sub={`${i.items} items · ${i.businesses} businesses`} />
        ))}
      </div>

      <FilterChips label="View" value={view} onChange={setView} className="mb-4" chips={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] }))} />

      {view === 'issue' && (issueId === 'next'
        ? <NextIssue ctx={ctx} next={next} />
        : <IssueItems ctx={ctx} items={data.items.filter((i) => i.issue_id === issueId)} issue={data.issues.find((i) => i.id === issueId)!} />)}
      {view === 'contributors' && <Contributors ctx={ctx} />}
      {view === 'freebies' && <Freebies ctx={ctx} />}
      {view === 'club_card' && <ClubCard ctx={ctx} />}
      {view === 'promises' && <Promises ctx={ctx} />}
      {view === 'markets' && <Markets ctx={ctx} />}
      {view === 'items' && <EveryItem ctx={ctx} />}
      {view === 'check' && <ToCheck ctx={ctx} />}
    </div>
  )
}

type Ctx = {
  data: NewsletterTabData
  run: (fn: () => Promise<{ error?: string }>, done: string) => void
  pending: boolean
  contributorsById: Map<string, NlContributor>
  issueDates: Map<string, string>
}

function IssueButton({ on, dashed, onClick, title, sub }: { on: boolean; dashed?: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex-none text-left px-2.5 py-1.5 rounded-sm border bg-white text-xs transition-colors duration-200 ease-out hover:bg-brand-warm',
        dashed && 'border-dashed',
        on ? 'border-brand-navy shadow-[inset_0_-3px_0_var(--brand-navy)]' : 'border-black/10',
      )}
    >
      <span className="block font-semibold text-brand-dark whitespace-nowrap">{title}</span>
      <span className="block text-gray-600 whitespace-nowrap">{sub}</span>
    </button>
  )
}

// Stage 14c: each section is a folded section (open on a computer, folded on a
// phone, remembered per browser) whose body scrolls inside, so the page ends at
// the first screen.
function Section({ id, title, hint, children, className }: { id: string; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <FoldSection
      storageKey={`newsletter.${id}`}
      id={id}
      big
      title={title}
      defaultOpen
      narrowOpen={false}
      hint={hint}
      scroll="max-h-[40vh] lg:max-h-[max(14rem,calc(100vh-26rem))]"
      className={cn('shadow-[var(--shadow-sm)]', className)}
      bodyClassName="relative px-3.5 pb-3 [&>p:first-child]:px-0 [&>p:first-child]:pb-2"
    >
      {children}
    </FoldSection>
  )
}

function BizLink({ id, name }: { id: string | null; name: string | null }) {
  if (!id || !name) return null
  return <Link href={`/businesses/${id}`} className="text-brand-navy font-semibold hover:underline">{name}</Link>
}

/* ---------- Next issue: Today's list, and who is due ---------- */

function NextIssue({ ctx, next }: { ctx: Ctx; next: { wednesday: string; items: NewsletterItem[] } }) {
  const { data, run, pending } = ctx
  const router = useRouter()
  const [moving, setMoving] = useState<string | null>(null)
  const nextWed = next.wednesday
  // Due: a monthly regular with a usual week when this is that week and they haven't been in this
  // month; anyone else when their next piece falls by this issue
  const nth = nthWednesday(nextWed)
  const dueContributors = data.contributors
    .map((c) => {
      if (!c.active) return null
      const byGap = !!c.next_expected && c.next_expected <= addDaysISO(nextWed, 3)
      const monthly = !c.expected_every_days || c.expected_every_days >= 21
      const byWeek = monthly && !!c.usual?.weeks.includes(nth) && (c.last_in ?? '').slice(0, 7) !== nextWed.slice(0, 7)
      // A monthly regular with a clear usual week is due in that week, not merely when the gap is up
      if (!(monthly && c.usual ? byWeek : byGap)) return null
      const why = [
        c.usual ? `usually the ${weekWords(c.usual.weeks)} (${c.usual.hits} of last ${c.usual.of})` : c.expected_every_days ? `every ${c.expected_every_days} days` : null,
        c.last_in ? `last ${shortGB(c.last_in)}` : 'not in yet',
      ].filter(Boolean).join(', ')
      return { c, why, late: byGap && c.next_expected! < data.today }
    })
    .filter((x): x is { c: NlContributor; why: string; late: boolean } => !!x)
    .sort((a, b) => (a.c.last_in ?? '').localeCompare(b.c.last_in ?? ''))
  const onList = new Set(next.items.map((i) => i.business_id).filter(Boolean))
  const due = data.queue.filter((q) => !onList.has(q.business_id)).slice(0, 6)
  const lastFreebie = data.items.find((i) => i.kind === 'freebie')

  function remove(n: NewsletterItem) {
    run(async () => {
      const r = await deleteNewsletterItem(n.kind, n.ref_id)
      if (r.undo) {
        const undo = r.undo
        toast.undo(`Taken off the newsletter: ${n.title}`, async () => {
          const back = await undoDeleteNewsletterItem(undo)
          if (back.error) toast.error(back.error)
          else router.refresh()
        })
      }
      return r
    }, 'Taken off the list')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
      <Section id="nl-next" title={`Next issue, ${weekdayGB(nextWed)}`} hint="The same list as Today. Mark each one once it has gone in.">
        {next.items.length === 0 ? <p className="text-sm text-gray-600">Nothing on the list yet. Add from a business page, an email or the suggestions here.</p> : (
          <ul className="divide-y divide-black/[0.06]">
            {next.items.map((n) => (
              <li key={n.key} className="py-2 flex flex-wrap items-center gap-2">
                <span className="flex-[1_1_220px] min-w-0">
                  <span className="block text-sm text-brand-dark">{n.title}</span>
                  <span className="block text-xs text-gray-600">
                    <BizLink id={n.business_id} name={n.business_name} />{n.business_name && n.date ? ' · ' : ''}{n.date ? dateGB(n.date) : ''}
                  </span>
                </span>
                <button type="button" className={mainBtn} disabled={pending} onClick={() => run(() => markNewsletterUsed(n.kind, n.ref_id), 'Ticked off: it has gone in')}>It has gone in</button>
                {moving === n.key ? (
                  <input type="date" aria-label={`New date for ${n.title}`} className={input} defaultValue={n.date ?? nextWed} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Escape') setMoving(null) }}
                    onChange={(e) => { const d = e.target.value; if (d) { setMoving(null); run(() => moveNewsletterItem(n.kind, n.ref_id, d), `Moved to ${dateGB(d)}`) } }} />
                ) : (
                  <button type="button" className={btn} disabled={pending} onClick={() => setMoving(n.key)}>Move</button>
                )}
                <button type="button" className={btn} disabled={pending} onClick={() => remove(n)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="nl-due" title="Due this week" hint={`From the patterns: regulars whose piece is due (this is the ${weekWords([nth])} of the month), then members and advertisers longest without a mention.`}>
        <ul className="divide-y divide-black/[0.06] text-sm">
          {dueContributors.map(({ c, why, late }) => (
            <li key={c.id} className="py-2">
              <span className="font-semibold text-brand-dark">{c.name}</span>{c.column_name && <>, {c.column_name}</>}{' '}
              <span className={cn(pill, late ? 'bg-ms-orange text-ms-orange-text' : 'bg-ms-muted text-ms-muted-text')}>{why}</span>
            </li>
          ))}
          {due.map((q) => (
            <li key={q.business_id} className="py-2 flex flex-wrap items-center gap-2">
              <span className="flex-[1_1_200px] min-w-0">
                <BizLink id={q.business_id} name={q.name} />{' '}
                <span className={cn(pill, q.last_in ? 'bg-ms-muted text-ms-muted-text' : 'bg-ms-red text-ms-red-text')}>
                  {q.deal === 'advertiser' ? 'advertiser' : 'Club Card'}, {q.last_in ? `last in ${dateGB(q.last_in)}` : 'not in since joining'}
                </span>
              </span>
              <button type="button" className={btn} onClick={() => { addToNewsletter('business', q.business_id).then((ok) => ok && router.refresh()) }}>Add to list</button>
            </li>
          ))}
          <li className="py-2">
            Freebie: {lastFreebie
              ? <>last one {dateGB(lastFreebie.date)}{lastFreebie.business_name && <>, <BizLink id={lastFreebie.business_id} name={lastFreebie.business_name} /></>}{lastFreebie.closes_on && <>, closes {dateGB(lastFreebie.closes_on)}</>}</>
              : 'none found yet'}
          </li>
        </ul>
      </Section>
    </div>
  )
}

/* ---------- One past issue ---------- */

function IssueItems({ ctx, items, issue }: { ctx: Ctx; items: NlItem[]; issue: NewsletterTabData['issues'][number] }) {
  const sections = useMemo(() => {
    const out: { key: string; items: NlItem[] }[] = []
    for (const it of items) {
      if (!out.length || out[out.length - 1].key !== it.section) out.push({ key: it.section, items: [] })
      out[out.length - 1].items.push(it)
    }
    return out
  }, [items])
  return (
    <Section id="nl-issue" title={`Issue of ${weekdayGB(issue.date)}`}
      hint={`${issue.items} items, ${issue.businesses} businesses. Change any item's kind, business or contributor with Edit; the weekly read keeps your choice.`}>
      {issue.url && <p className="text-sm mb-2"><a href={issue.url} target="_blank" rel="noreferrer" className="text-brand-navy hover:underline">Open the issue in Mailchimp</a></p>}
      {sections.map((s, n) => (
        <div key={`${s.key}-${n}`} className="mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 border-b border-black/[0.06] pb-1">{SECTION_LABEL[s.key] ?? s.key}</h3>
          <ul className="divide-y divide-black/[0.06]">{s.items.map((it) => <ItemRow key={it.id} ctx={ctx} item={it} />)}</ul>
        </div>
      ))}
    </Section>
  )
}

function ItemRow({ ctx, item: it, showDate }: { ctx: Ctx; item: NlItem; showDate?: boolean }) {
  const [editing, setEditing] = useState(false)
  const contributor = it.contributor_id ? ctx.contributorsById.get(it.contributor_id) : null
  const title = it.headline ?? (it.kind === 'banner' ? it.link_url : null) ?? '(no headline)'
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-start gap-2">
        <span className="flex-[1_1_260px] min-w-0">
          <span className="block text-sm text-brand-dark">
            {showDate && <span className="text-gray-600 tabular-nums">{dateGB(it.date)} · </span>}
            {it.link_url && it.kind !== 'banner' ? <a href={it.link_url} target="_blank" rel="noreferrer" className="hover:underline">{title}</a> : <span className="break-all">{title}</span>}
          </span>
          {it.blurb && <span className="block text-xs text-gray-600 line-clamp-2">{it.blurb}</span>}
          <span className="block text-xs text-gray-700 mt-0.5">
            <span className={cn(pill, 'bg-ms-muted text-ms-muted-text mr-1')}>{KIND_LABEL[it.kind]}</span>
            <BizLink id={it.business_id} name={it.business_name} />
            {contributor && <>{it.business_id ? ' · ' : ''}by {contributor.name}</>}
            {it.closes_on && <> · closes {dateGB(it.closes_on)}</>}
            {it.edited && <> · edited by hand</>}
          </span>
        </span>
        <button type="button" className={btn} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>{editing ? 'Close' : 'Edit'}</button>
      </div>
      {editing && <ItemEditor ctx={ctx} item={it} onDone={() => setEditing(false)} />}
    </li>
  )
}

/** A business picked by typing its name (the list is long). Empty means none. */
function BusinessInput({ ctx, id, value, onChange, label }: { ctx: Ctx; id: string; value: string | null; onChange: (id: string | null) => void; label: string }) {
  const byName = useMemo(() => new Map(ctx.data.businesses.map((b) => [b.name.toLowerCase(), b.id])), [ctx.data.businesses])
  const nameOf = useMemo(() => new Map(ctx.data.businesses.map((b) => [b.id, b.name])), [ctx.data.businesses])
  const [text, setText] = useState(value ? nameOf.get(value) ?? '' : '')
  const known = !text.trim() || byName.has(text.trim().toLowerCase())
  return (
    <label className="flex flex-col text-xs text-gray-700 gap-0.5 min-w-0">
      {label}
      <input id={id} list="nl-businesses" className={input} value={text} placeholder="None"
        aria-invalid={!known}
        onChange={(e) => { const t = e.target.value; setText(t); onChange(t.trim() ? byName.get(t.trim().toLowerCase()) ?? null : null) }} />
      {!known && <span className="text-ms-red-text">Pick a business from the list</span>}
    </label>
  )
}

function ItemEditor({ ctx, item, onDone }: { ctx: Ctx; item: NlItem; onDone: () => void }) {
  const [kind, setKind] = useState<ItemKind>(item.kind)
  const [biz, setBiz] = useState<string | null>(item.business_id)
  const [contrib, setContrib] = useState<string>(item.contributor_id ?? '')
  return (
    <form className="mt-2 p-2 bg-brand-warm rounded-sm flex flex-wrap items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); ctx.run(() => updateNewsletterItem(item.id, { kind, business_id: biz, contributor_id: contrib || null }), 'Item saved'); onDone() }}>
      <datalist id="nl-businesses">{ctx.data.businesses.map((b) => <option key={b.id} value={b.name} />)}</datalist>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">Kind
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <BusinessInput ctx={ctx} id={`biz-${item.id}`} value={biz} onChange={setBiz} label="Business" />
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">Contributor
        <select className={input} value={contrib} onChange={(e) => setContrib(e.target.value)}>
          <option value="">None</option>
          {ctx.data.contributors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <button type="submit" className={mainBtn} disabled={ctx.pending}>Save</button>
      <button type="button" className={btn} onClick={onDone}>Cancel</button>
    </form>
  )
}

/* ---------- Contributors ---------- */

function Contributors({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const [editing, setEditing] = useState<string | null>(null)
  const recent = data.issues.slice(0, 26).reverse()
  const inIssue = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const it of data.items) if (it.contributor_id) m.set(it.contributor_id, (m.get(it.contributor_id) ?? new Set()).add(it.issue_id))
    return m
  }, [data.items])
  const rows = [...data.contributors].sort((a, b) => Number(b.active) - Number(a.active) || b.issues_total - a.issues_total)
  return (
    <Section id="nl-contributors" title="Contributors"
      hint={`Regular writers and series, found by name or phrase (capitals ignored) in each item. Usual week: which Wednesday of the month, from their last 12 appearances. Dots: the last ${recent.length} issues, oldest first. "Every" is how often you expect them; leave it blank for no fixed rhythm.`}>
      <div className="mb-2"><button type="button" className={btn} onClick={() => setEditing('new')}>Add a contributor</button></div>
      {editing === 'new' && <ContributorEditor ctx={ctx} onDone={() => setEditing(null)} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[13px] border-collapse">
          <caption className="sr-only">Contributors, most issues first.</caption>
          <thead><tr>{['Who', 'Column', 'Business', 'Every', 'Usual week', 'Last 26 issues', 'Last 12 months', 'Last in', 'Next expected', ''].map((h) => (
            <th key={h} scope="col" className="text-left text-[11px] uppercase tracking-wide text-gray-600 font-semibold px-2 py-1.5 border-b border-black/[0.08] whitespace-nowrap">{h}</th>
          ))}</tr></thead>
          <tbody>
            {rows.map((c) => {
              const seen = inIssue.get(c.id) ?? new Set()
              const late = c.active && c.next_expected && c.next_expected < data.today
              return (
                <tr key={c.id} className={cn('border-b border-black/[0.06] align-top', !c.active && 'text-gray-500')}>
                  <th scope="row" className="text-left font-semibold px-2 py-1.5 whitespace-nowrap">{c.name}{!c.active && <span className="font-normal"> (stopped)</span>}</th>
                  <td className="px-2 py-1.5">{c.column_name}</td>
                  <td className="px-2 py-1.5"><BizLink id={c.business_id} name={c.business_name} /></td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{c.expected_every_days ? `${c.expected_every_days} days` : ''}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{c.usual ? <>{weekWords(c.usual.weeks)} <span className="text-gray-600">({c.usual.hits} of {c.usual.of})</span></> : <span className="text-gray-600">any week</span>}</td>
                  <td className="px-2 py-1.5 font-mono tracking-[2px] whitespace-nowrap" aria-label={`In ${recent.filter((i) => seen.has(i.id)).length} of the last ${recent.length} issues`}>
                    {recent.map((i) => (seen.has(i.id) ? '●' : '·')).join('')}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{c.issues_last_12_months}</td>
                  <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{dateGB(c.last_in)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{c.next_expected && c.active ? <span className={cn(pill, late ? 'bg-ms-orange text-ms-orange-text' : 'bg-ms-muted text-ms-muted-text')}>{late ? 'due since ' : ''}{dateGB(c.next_expected)}</span> : ''}</td>
                  <td className="px-2 py-1.5"><button type="button" className={btn} aria-label={`Edit ${c.name}`} onClick={() => setEditing(editing === c.id ? null : c.id)}>Edit</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && editing !== 'new' && <ContributorEditor ctx={ctx} contributor={data.contributors.find((c) => c.id === editing)} onDone={() => setEditing(null)} />}
    </Section>
  )
}

function ContributorEditor({ ctx, contributor: c, onDone }: { ctx: Ctx; contributor?: NlContributor; onDone: () => void }) {
  const [f, setF] = useState<ContributorInput>({
    id: c?.id, name: c?.name ?? '', column_name: c?.column_name ?? null, business_id: c?.business_id ?? null,
    aliases: c?.aliases ?? [], expected_every_days: c?.expected_every_days ?? null, active: c?.active ?? true, notes: c?.notes ?? null,
  })
  const set = (p: Partial<ContributorInput>) => setF((x) => ({ ...x, ...p }))
  return (
    <form className="my-2 p-2 bg-brand-warm rounded-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end"
      onSubmit={(e) => { e.preventDefault(); ctx.run(() => saveContributor(f), c ? `${f.name} saved` : `${f.name} added`); onDone() }}>
      <datalist id="nl-businesses">{ctx.data.businesses.map((b) => <option key={b.id} value={b.name} />)}</datalist>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">Name
        <input className={input} required value={f.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">Column
        <input className={input} value={f.column_name ?? ''} onChange={(e) => set({ column_name: e.target.value })} />
      </label>
      <BusinessInput ctx={ctx} id={`cbiz-${c?.id ?? 'new'}`} value={f.business_id} onChange={(id) => set({ business_id: id })} label="Business" />
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">Other names, comma separated
        <input className={input} value={f.aliases.join(', ')} onChange={(e) => set({ aliases: e.target.value.split(',') })} />
      </label>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">Expected every (days)
        <input className={input} type="number" min={1} value={f.expected_every_days ?? ''} onChange={(e) => set({ expected_every_days: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5 sm:col-span-2">Notes
        <input className={input} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm min-h-10 md:min-h-8">
        <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Still writing
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" className={mainBtn} disabled={ctx.pending}>Save</button>
        <button type="button" className={btn} onClick={onDone}>Cancel</button>
        {c && <button type="button" className={btn} disabled={ctx.pending}
          onClick={() => { if (window.confirm(`Delete ${c.name}? Their items keep their text but lose the name.`)) { ctx.run(() => deleteContributor(c.id), `${c.name} deleted`); onDone() } }}>Delete</button>}
      </div>
    </form>
  )
}

/* ---------- Freebies and competitions ---------- */

function Freebies({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const items = data.items.filter((i) => i.kind === 'freebie' || i.kind === 'competition')
  const hadOne = new Set(data.items.filter((i) => i.kind === 'freebie' && i.business_id).map((i) => i.business_id))
  const never = data.queue.filter((q) => !hadOne.has(q.business_id))
  const open = items.filter((i) => i.closes_on && i.closes_on >= data.today)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
      <Section id="nl-freebies" title="Freebies and competitions"
        hint={`${items.filter((i) => i.kind === 'freebie').length} freebies and ${items.filter((i) => i.kind === 'competition').length} competitions, newest first.${open.length ? ` Open now: ${open.length}.` : ''} Reader entries go to the info@ mailbox, so they are not counted here.`}>
        <ul className="divide-y divide-black/[0.06]">{items.map((it) => <ItemRow key={it.id} ctx={ctx} item={it} showDate />)}</ul>
      </Section>
      <Section id="nl-never-freebie" title="Never had a freebie" hint="Club Card members and advertisers with a deal in force and no freebie found.">
        <ul className="text-sm columns-1 sm:columns-2 lg:columns-1 xl:columns-2">
          {never.map((q) => <li key={q.business_id} className="py-0.5 break-inside-avoid"><BizLink id={q.business_id} name={q.name} /></li>)}
        </ul>
      </Section>
    </div>
  )
}

/* ---------- Club Card ---------- */

function ClubCard({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const router = useRouter()
  const queue = data.queue.filter((q) => q.deal === 'club_card')
  const spotlights = data.items.filter((i) => i.kind.startsWith('club_card_')).slice(0, 40)
  const never = queue.filter((q) => !q.last_in).length
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Section id="nl-cc-queue" title="Due a mention"
        hint={`${queue.length} members. ${never} not in since joining (oldest joiner first), then the longest since their last mention.`}>
        <ol className="divide-y divide-black/[0.06] text-sm">
          {queue.map((q, n) => (
            <li key={q.business_id} className="py-1.5 flex flex-wrap items-center gap-2">
              <span className="w-7 text-right tabular-nums text-gray-600">{n + 1}.</span>
              <span className="flex-[1_1_200px] min-w-0">
                <BizLink id={q.business_id} name={q.name} />
                <span className="text-xs text-gray-600"> · {q.last_in ? `last in ${dateGB(q.last_in)}, ${Math.round(q.days! / 7)} weeks ago` : `not in since joining${q.joined ? ` on ${dateGB(q.joined)}` : ''}`}</span>
              </span>
              <button type="button" className={btn} onClick={() => { addToNewsletter('business', q.business_id).then((ok) => ok && router.refresh()) }}>Add to list</button>
            </li>
          ))}
        </ol>
      </Section>
      <Section id="nl-cc-items" title="Club Card in the newsletter" hint="New members, offers and members' events, newest first (the last 40).">
        <ul className="divide-y divide-black/[0.06]">{spotlights.map((it) => <ItemRow key={it.id} ctx={ctx} item={it} showDate />)}</ul>
      </Section>
    </div>
  )
}

/* ---------- Deal promises ---------- */

function promiseText(p: NlPromise) {
  const [one, many] = PROMISE_WORD[p.kind]
  const what = `${p.quantity} ${p.quantity === 1 ? one : many}`
  return p.per === 'term' ? `${what} in the deal` : `${what} a ${p.per}`
}

function Promises({ ctx }: { ctx: Ctx }) {
  const { data, run, pending } = ctx
  const [adding, setAdding] = useState(false)
  return (
    <div>
      <p className="text-xs text-gray-600 mb-2">
        Newsletter space each deal includes, counted against the issues in its term. Blogs and editorials are counted from the items with that business; banners and ads are images, so tick the issues they ran in.
      </p>
      <div className="mb-3"><button type="button" className={btn} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : 'Add a promise'}</button></div>
      {adding && <PromiseAdder ctx={ctx} onDone={() => setAdding(false)} />}
      {data.promises.length === 0 ? <p className="text-sm text-gray-600">No promises recorded yet.</p> : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.promises.map((p) => {
            const owed = Math.max(0, p.due_so_far - p.delivered)
            const tone = owed === 0 ? 'bg-ms-green text-ms-green-text' : p.term_over ? 'bg-ms-red text-ms-red-text' : 'bg-ms-orange text-ms-orange-text'
            const inTerm = data.issues.filter((i) => (!p.contract_start || i.date >= p.contract_start) && (!p.contract_end || i.date <= p.contract_end))
            const ticked = new Set(p.ticks)
            const delivered = p.kind === 'banner' || p.kind === 'ad' ? [] : data.items.filter((it) => it.business_id === p.business_id && inTerm.some((i) => i.id === it.issue_id)
              && (p.kind === 'mention' || (p.kind === 'blog' ? it.kind === 'guest_blog' || it.kind === 'column' : !['more_news', 'jazz', 'banner', 'appeal', 'other'].includes(it.kind))))
            return (
              <li key={p.id} className={cn(card, 'px-3.5 py-3 flex flex-col gap-1.5 min-w-0')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <BizLink id={p.business_id} name={p.business_name} />
                  <span className={cn(pill, tone)}>
                    {owed > 0 ? `${p.delivered} of ${p.due_so_far} in, ${owed} owed` : `${p.delivered} in, ${p.due_so_far} due so far`}{p.term_over ? ', term over' : ''}
                  </span>
                </div>
                <p className="text-sm">{promiseText(p)} · {dateGB(p.contract_start)} to {p.contract_end ? dateGB(p.contract_end) : 'no end date'}</p>
                {p.notes && <p className="text-xs text-gray-600">{p.notes}</p>}
                {p.kind === 'banner' || p.kind === 'ad' ? (
                  <fieldset className="flex flex-wrap gap-1">
                    <legend className="text-xs text-gray-700 mb-1">Issues it ran in</legend>
                    {inTerm.slice().reverse().map((i) => (
                      <label key={i.id} className={cn('inline-flex items-center gap-1 text-xs px-1.5 min-h-10 md:min-h-7 border rounded-sm', ticked.has(i.id) ? 'border-brand-navy bg-brand-warm' : 'border-black/10')}>
                        <input type="checkbox" checked={ticked.has(i.id)} disabled={pending}
                          onChange={(e) => run(() => setPromiseTick(p.id, i.id, e.target.checked), e.target.checked ? `Ticked ${shortGB(i.date)}` : `Unticked ${shortGB(i.date)}`)} />
                        {shortGB(i.date)}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <ul className="text-xs text-gray-700">
                    {delivered.length === 0 ? <li>None found in the term.</li> : delivered.map((it) => <li key={it.id}>{dateGB(it.date)}: {it.headline}</li>)}
                  </ul>
                )}
                <div className="mt-auto pt-1"><button type="button" className={btn} disabled={pending}
                  onClick={() => { if (window.confirm(`Delete this promise for ${p.business_name}?`)) run(() => deletePromise(p.id), 'Promise deleted') }}>Delete</button></div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PromiseAdder({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const [contract, setContract] = useState('')
  const [kind, setKind] = useState<NlPromise['kind']>('blog')
  const [quantity, setQuantity] = useState(1)
  const [per, setPer] = useState<NlPromise['per']>('term')
  const [notes, setNotes] = useState('')
  return (
    <form className="mb-3 p-2 bg-brand-warm rounded-sm flex flex-wrap items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); if (!contract) return; ctx.run(() => addPromise({ contract_id: contract, kind, quantity, per, notes }), 'Promise added'); onDone() }}>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5 min-w-0 max-w-full">Deal
        <select className={input} required value={contract} onChange={(e) => setContract(e.target.value)}>
          <option value="">Choose a current deal</option>
          {ctx.data.contracts.map((c) => <option key={c.id} value={c.id}>{c.business_name} ({c.membership_type === 'advertiser' ? 'advertiser' : 'Club Card'}, {dateGB(c.contract_start)} to {dateGB(c.contract_end)})</option>)}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">How many
        <input className={cn(input, 'w-20')} type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      </label>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">What
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value as NlPromise['kind'])}>
          {(Object.keys(PROMISE_WORD) as NlPromise['kind'][]).map((k) => <option key={k} value={k}>{PROMISE_WORD[k][1]}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5">Per
        <select className={input} value={per} onChange={(e) => setPer(e.target.value as NlPromise['per'])}>
          <option value="term">the whole deal</option><option value="month">month</option><option value="week">week</option>
        </select>
      </label>
      <label className="flex flex-col text-xs text-gray-700 gap-0.5 flex-[1_1_200px]">Notes
        <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button type="submit" className={mainBtn} disabled={ctx.pending || !contract}>Add</button>
    </form>
  )
}

/* ---------- Markets and regulars ---------- */

function Markets({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const groups = useMemo(() => {
    const m = new Map<string, { id: string | null; name: string; dates: string[] }>()
    for (const it of data.items) {
      if (it.kind !== 'market') continue
      const key = it.business_id ?? 'other'
      const g = m.get(key) ?? { id: it.business_id, name: it.business_name ?? 'Other markets', dates: [] }
      if (!g.dates.includes(it.date)) g.dates.push(it.date)
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.dates.length - a.dates.length)
  }, [data.items])
  const jazzIssues = new Set(data.items.filter((i) => i.kind === 'jazz').map((i) => i.issue_id)).size
  return (
    <Section id="nl-markets" title="Markets and regulars" hint={`Each market and the issues it was in, newest first. Jazz at George IV was in ${jazzIssues} of ${data.issues.length} issues.`}>
      <ul className="divide-y divide-black/[0.06]">
        {groups.map((g) => {
          const gap = g.dates.length ? Math.round((Date.parse(`${data.today}T12:00:00Z`) - Date.parse(`${g.dates[0]}T12:00:00Z`)) / (7 * 86_400_000)) : null
          return (
            <li key={g.id ?? 'other'} className="py-2">
              <p className="text-sm">
                {g.id ? <BizLink id={g.id} name={g.name} /> : <span className="font-semibold">{g.name}</span>}
                <span className="text-xs text-gray-600"> · {g.dates.length} issues, last {dateGB(g.dates[0])}{gap !== null && gap >= 5 ? `, ${gap} weeks ago` : ''}</span>
              </p>
              <p className="text-xs text-gray-600 tabular-nums">{g.dates.slice(0, 24).map(shortGB).join(' · ')}{g.dates.length > 24 ? ' …' : ''}</p>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/* ---------- Every item ---------- */

function EveryItem({ ctx }: { ctx: Ctx }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<ItemKind | ''>('')
  const [limit, setLimit] = useState(100)
  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return ctx.data.items.filter((it) => (!kind || it.kind === kind) && words.every((w) =>
      `${it.headline ?? ''} ${it.blurb ?? ''} ${it.business_name ?? ''} ${it.link_url ?? ''}`.toLowerCase().includes(w)))
  }, [ctx.data.items, q, kind])
  return (
    <Section id="nl-items" title="Every item" hint="Search every headline, blurb and business in the issues held.">
      <div className="flex flex-wrap gap-2 mb-2">
        <label className="flex flex-col text-xs text-gray-700 gap-0.5 flex-[1_1_240px]">Search
          <input type="search" className={input} value={q} onChange={(e) => { setQ(e.target.value); setLimit(100) }} placeholder="e.g. Killik, pension, quiz night" />
        </label>
        <label className="flex flex-col text-xs text-gray-700 gap-0.5">Kind
          <select className={input} value={kind} onChange={(e) => { setKind(e.target.value as ItemKind | ''); setLimit(100) }}>
            <option value="">Every kind</option>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-600 mb-1" aria-live="polite">{found.length.toLocaleString('en-GB')} items</p>
      <ul className="divide-y divide-black/[0.06]">{found.slice(0, limit).map((it) => <ItemRow key={it.id} ctx={ctx} item={it} showDate />)}</ul>
      {found.length > limit && <button type="button" className={cn(btn, 'mt-2')} onClick={() => setLimit((l) => l + 100)}>Show 100 more</button>}
    </Section>
  )
}

/* ---------- To check ---------- */

function ToCheck({ ctx }: { ctx: Ctx }) {
  const { data, run, pending } = ctx
  return (
    <Section id="nl-check" title="Mentions to check"
      hint="The read wasn't sure these are about the business named. Yes counts it (and links the item); No drops it. The weekly read keeps your answer.">
      {data.toCheck.length === 0 ? <p className="text-sm text-gray-600">Nothing to check.</p> : (
        <ul className="divide-y divide-black/[0.06]">
          {data.toCheck.map((m) => (
            <li key={m.id} className="py-2 flex flex-wrap items-start gap-2">
              <span className="flex-[1_1_280px] min-w-0">
                <span className="block text-sm"><BizLink id={m.business_id} name={m.business_name} /><span className="text-xs text-gray-600"> · {dateGB(m.date)} · matched &ldquo;{m.matched_text}&rdquo;{m.reason ? `, ${m.reason}` : ''}</span></span>
                {m.context && <span className="block text-xs text-gray-700 line-clamp-2">{m.context}</span>}
              </span>
              <span className="flex gap-2" role="group" aria-label={`Is this about ${m.business_name}?`}>
                <button type="button" className={mainBtn} disabled={pending} onClick={() => run(() => decideMention(m.id, true), `Counted for ${m.business_name}`)}>Yes</button>
                <button type="button" className={btn} disabled={pending} onClick={() => run(() => decideMention(m.id, false), `Dropped for ${m.business_name}`)}>No</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

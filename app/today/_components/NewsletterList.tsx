'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import { addCalendarItem, getNewsletterList, markNewsletterUsed, type NewsletterItem } from '@/app/actions/calendar'
import { CALENDAR_CHANGED } from './TodayCalendar'

// "For Wednesday's newsletter" (UI overhaul Stage 12): one list to build the
// weekly newsletter from. Open For Newsletter to-dos, routine promises to put
// something in the newsletter, and "promote my event" editorial emails. Tick
// one off once it has gone in and it leaves the list.

const btn = 'text-xs font-semibold px-2.5 py-1.5 border border-black/[0.12] rounded-sm bg-white text-brand-navy hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

const KIND_LABEL: Record<NewsletterItem['kind'], string> = {
  task: 'For newsletter',
  commitment: 'You said you would',
  editorial: 'Promote my event',
}

const dateGB = (d: string) => formatDateGB(`${d}T12:00:00Z`)

export function NewsletterList({
  initial,
  onChanged,
}: {
  initial: { wednesday: string; items: NewsletterItem[] }
  onChanged: () => void
}) {
  const [list, setList] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const result = await getNewsletterList()
    if (result.data) setList(result.data)
  }, [])

  useEffect(() => {
    window.addEventListener(CALENDAR_CHANGED, load)
    return () => window.removeEventListener(CALENDAR_CHANGED, load)
  }, [load])

  async function used(i: NewsletterItem) {
    setBusy(i.key)
    const result = await markNewsletterUsed(i.kind, i.ref_id)
    setBusy(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Ticked off: it has gone in')
    setList((l) => ({ ...l, items: l.items.filter((x) => x.key !== i.key) }))
    window.dispatchEvent(new Event(CALENDAR_CHANGED))
    onChanged()
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setAdding(true)
    const result = await addCalendarItem({ kind: 'newsletter', title, date: list.wednesday })
    setAdding(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Added for ${dateGB(list.wednesday)}`)
    setTitle('')
    window.dispatchEvent(new Event(CALENDAR_CHANGED))
    onChanged()
  }

  return (
    <section id="newsletter" aria-labelledby="newsletter-h" className="space-y-2 scroll-mt-20">
      <h2 id="newsletter-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>
        For Wednesday&apos;s newsletter
      </h2>
      <p className="text-xs text-gray-500">
        Next one goes out on {new Date(`${list.wednesday}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}.
        {' '}Newsletter to-dos, promises to include something, and &quot;promote my event&quot; emails. Tick each off once it has gone in.
        Add more with the &quot;For newsletter&quot; button on an email, a business or a to-do.
      </p>
      {list.items.length === 0 ? (
        <p className="text-sm text-gray-600 py-2">Nothing on the list yet.</p>
      ) : (
        <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
          {list.items.map((i) => (
            <li key={i.key} className="py-3 px-1 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start">
              <span className="justify-self-start text-[11px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap bg-brand-olive/15 text-brand-dark">
                {KIND_LABEL[i.kind]}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-brand-dark break-words">{i.title}</p>
                <p className="text-xs text-gray-500">
                  {i.business_id ? (
                    <Link href={`/businesses/${i.business_id}`} className="font-semibold text-brand-navy hover:underline">{i.business_name}</Link>
                  ) : (
                    'No business'
                  )}
                  {i.date ? ` · ${dateGB(i.date)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                <button type="button" disabled={busy === i.key} className={btn} onClick={() => used(i)}>
                  {busy === i.key ? 'Saving…' : 'It has gone in'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
        <label className="block flex-1 min-w-[200px]">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Add to the list</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full text-sm border border-black/[0.12] rounded-sm px-2.5 py-2 bg-white" />
        </label>
        <button type="submit" disabled={adding || !title.trim()} className="text-sm font-semibold px-4 py-2 rounded-sm bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors duration-200 ease-out disabled:opacity-50">
          {adding ? 'Adding…' : 'Add item'}
        </button>
      </form>
    </section>
  )
}

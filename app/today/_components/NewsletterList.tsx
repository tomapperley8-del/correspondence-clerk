'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import { addCalendarItem, getNewsletterList, markNewsletterUsed, type NewsletterItem } from '@/app/actions/calendar'
import { CALENDAR_CHANGED } from './TodayCalendar'
import { FullScreenPanel } from '@/components/ui/full-screen-panel'
import { ItemList, ItemRow, rowButtonClass } from '@/components/ui/item-row'

// "For Wednesday's newsletter" (UI overhaul Stage 12): one list to build the
// weekly newsletter from. Open For Newsletter to-dos, routine promises to put
// something in the newsletter, and "promote my event" editorial emails. Tick
// one off once it has gone in and it leaves the list.
// Stage 14a: one line per item, and a Full screen button.

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

  const goesOut = new Date(`${list.wednesday}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

  return (
    <FullScreenPanel id="newsletter" className="scroll-mt-20" headingId="newsletter-h" title={<>For Wednesday&apos;s newsletter</>}>
      <div className="space-y-2">
        <p className="text-xs text-gray-700">
          Goes out on {goesOut}. Tick each off once it has gone in. Add more with the &quot;For newsletter&quot; button on an email, a
          business or a to-do.
        </p>
        {list.items.length === 0 ? (
          <p className="text-sm text-gray-700 py-2">Nothing on the list yet.</p>
        ) : (
          <ItemList label="For Wednesday's newsletter">
            {list.items.map((i) => (
              <ItemRow
                key={i.key}
                tag={KIND_LABEL[i.kind]}
                tagClassName="bg-brand-olive/15 text-brand-dark"
                title={i.business_name ?? i.title}
                href={i.business_id ? `/businesses/${i.business_id}` : null}
                detail={i.business_name ? i.title : undefined}
                meta={i.date ? dateGB(i.date) : undefined}
                actions={
                  <button type="button" disabled={busy === i.key} className={rowButtonClass} onClick={() => used(i)}>
                    {busy === i.key ? 'Saving…' : 'It has gone in'}
                  </button>
                }
              />
            ))}
          </ItemList>
        )}
        <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
          <label className="block flex-1 min-w-[180px]">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Add to the list</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full text-sm border border-black/[0.12] rounded-sm px-2.5 min-h-10 bg-white" />
          </label>
          <button type="submit" disabled={adding || !title.trim()} className="text-sm font-semibold px-4 min-h-10 rounded-sm bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors duration-200 ease-out disabled:opacity-50">
            {adding ? 'Adding…' : 'Add item'}
          </button>
        </form>
      </div>
    </FullScreenPanel>
  )
}

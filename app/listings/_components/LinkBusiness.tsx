'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { setListingBusiness } from '@/app/actions/listings'

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * "Link to business" (or "Change") for one listing request. Saves on the request only; the
 * nightly read keeps the choice. Suggests businesses whose name shares a word with the
 * requester's email domain or name.
 */
export function LinkBusiness({ listingId, linked, hint, businesses }: {
  listingId: string
  linked: boolean
  hint: string | null
  businesses: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pending, start] = useTransition()

  const matches = useMemo(() => {
    const term = key(q)
    if (term) return businesses.filter((b) => key(b.name).includes(term)).slice(0, 8)
    // Before typing: names sharing a word (4+ letters) with the email domain or the requester's name
    const words = key(hint ?? '').split(' ').filter((w) => w.length >= 4 && !['gmail', 'hotmail', 'yahoo', 'outlook', 'icloud'].includes(w))
    if (!words.length) return []
    return businesses.filter((b) => { const n = key(b.name); return words.some((w) => n.includes(w)) }).slice(0, 5)
  }, [q, hint, businesses])

  const save = (businessId: string | null, name?: string) => start(async () => {
    const r = await setListingBusiness(listingId, businessId)
    if (r.error) return toast.error(`Could not save: ${r.error}`)
    toast.success(businessId ? `Linked to ${name}` : 'Unlinked; the next read works it out again')
    setOpen(false)
    setQ('')
    router.refresh()
  })

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-brand-navy hover:underline">
        {linked ? 'Change' : 'Link to business'}
      </button>
    )
  }
  return (
    <div className="mt-1 w-56 border border-gray-300 bg-white shadow-[var(--shadow-sm)]">
      <input
        id={`link-business-${listingId}`}
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
        placeholder="Type a business name"
        aria-label="Business name"
        className="w-full px-2 py-1 text-sm border-b border-gray-200 focus:outline-none"
      />
      <ul role="listbox" aria-label="Businesses" className="max-h-48 overflow-y-auto">
        {matches.map((b) => (
          <li key={b.id}>
            <button disabled={pending} onClick={() => save(b.id, b.name)}
              className="w-full text-left px-2 py-1 text-sm hover:bg-brand-warm disabled:opacity-50">{b.name}</button>
          </li>
        ))}
        {q && matches.length === 0 && <li className="px-2 py-1 text-xs text-gray-500">No business by that name</li>}
      </ul>
      <div className="flex justify-between gap-2 px-2 py-1 border-t border-gray-200">
        {linked
          ? <button disabled={pending} onClick={() => save(null)} className="text-xs text-brand-navy hover:underline">Unlink</button>
          : <span />}
        <button onClick={() => setOpen(false)} className="text-xs text-gray-600 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

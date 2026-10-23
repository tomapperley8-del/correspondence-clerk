'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmClubCardSuggestions, createBusinessForClubCardPage, setClubCardMatch, type ReviewPage } from '@/app/actions/club-card'
import { toast } from '@/lib/toast'

function refreshNav() {
  window.dispatchEvent(new Event('cc:nav-refresh'))
}

const btn = 'text-xs font-semibold px-2.5 py-1 rounded-sm border border-black/[0.12] bg-white hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50'

export function ClubCardReview({ pages, businesses }: { pages: ReviewPage[]; businesses: { id: string; name: string }[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  // A business typed into a row's box, by page id
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const names = useMemo(() => new Map(businesses.map((b) => [b.id, b.name])), [businesses])
  const byName = useMemo(() => new Map(businesses.map((b) => [b.name.toLowerCase(), b.id])), [businesses])

  const toCheck = pages.filter((p) => p.match_status === 'unmatched' || p.match_status === 'suggested')
  const matched = pages.filter((p) => p.match_status === 'confirmed')
  const notMember = pages.filter((p) => p.match_status === 'not_a_member')
  const clearSuggestions = toCheck.filter((p) => p.match_status === 'suggested' && p.suggested_business_id && !(p.match_reason ?? '').startsWith('unclear'))

  async function save(page: ReviewPage, businessId: string | null) {
    setBusy(page.id)
    const res = await setClubCardMatch(page.id, businessId)
    setBusy(null)
    if (res.error) return toast.error(res.error)
    toast.success(businessId ? `${page.title}: matched to ${names.get(businessId)}` : `${page.title}: not a member page`)
    refreshNav()
    router.refresh()
  }

  async function addNew(page: ReviewPage, typedName: string) {
    const name = typedName.trim()
    if (!window.confirm(`Add "${name}" as a new business and match "${page.title}" to it? It starts as a Prospect until its Club Card contract is recorded.`)) return
    setBusy(page.id)
    const res = await createBusinessForClubCardPage(page.id, name)
    setBusy(null)
    if (res.error) return toast.error(res.error)
    toast.success(`${name} added and matched`)
    setChosen({ ...chosen, [page.id]: '' })
    refreshNav()
    router.refresh()
  }

  async function confirmAll() {
    if (!window.confirm(`Confirm the ${clearSuggestions.length} clear suggestions as they are? You can change any of them afterwards.`)) return
    setBusy('all')
    const res = await confirmClubCardSuggestions(clearSuggestions.map((p) => p.id))
    setBusy(null)
    if (res.error) toast.error(res.error)
    else toast.success(`${res.confirmed} pages matched`)
    refreshNav()
    router.refresh()
  }

  function row(p: ReviewPage) {
    const typed = chosen[p.id] ?? ''
    const typedId = byName.get(typed.trim().toLowerCase()) ?? null
    const current = p.business_id ?? p.suggested_business_id
    return (
      <li key={p.id} className="py-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 text-sm">
          <a href={p.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline break-words">{p.title}</a>
          <p className="text-xs text-gray-600 mt-0.5 break-words">
            {[p.page_phone, p.page_website?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), p.page_postcode].filter(Boolean).join(' · ') || 'No contact details on the page'}
          </p>
          {p.offer_text && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.offer_text}</p>}
        </div>
        <div className="text-sm space-y-1.5">
          {p.match_status === 'confirmed' ? (
            <p>
              <span className="text-gray-500">Matched to </span>
              <a href={`/businesses/${p.business_id}`} className="font-semibold text-brand-dark hover:underline">{names.get(p.business_id!) ?? 'a business'}</a>
              <span className="text-gray-500 text-xs"> ({p.matched_by === 'sync' ? 'by the nightly read' : 'by you'})</span>
            </p>
          ) : current ? (
            <p>
              <span className="text-gray-500">Suggested: </span>
              <span className="font-semibold text-brand-dark">{names.get(current) ?? 'a business'}</span>
              <span className="block text-xs text-gray-500">{p.match_reason}</span>
            </p>
          ) : (
            <p className="text-gray-500">{p.match_status === 'not_a_member' ? 'Not a member page' : `No suggestion: ${p.match_reason ?? 'nothing found'}`}</p>
          )}
          <div className="flex flex-wrap gap-1.5 items-center">
            {p.match_status !== 'confirmed' && current && (
              <button type="button" className={btn} disabled={!!busy} onClick={() => save(p, current)}>Confirm</button>
            )}
            <input
              list="club-card-businesses"
              value={typed}
              onChange={(e) => setChosen({ ...chosen, [p.id]: e.target.value })}
              placeholder={p.match_status === 'confirmed' ? 'Change to…' : 'Another business…'}
              aria-label={`Business for ${p.title}`}
              className="text-xs border border-black/[0.12] rounded-sm px-2 py-1 w-44 min-w-0"
            />
            {typed.trim() && !typedId ? (
              <button type="button" className={btn} disabled={!!busy} onClick={() => addNew(p, typed)}
                title="No business with this name yet: add it, with the page's address and phone, and match the page to it">
                Add as new business
              </button>
            ) : (
              <button type="button" className={btn} disabled={!!busy || !typedId} onClick={() => typedId && save(p, typedId)}>Use this</button>
            )}
            {p.match_status !== 'not_a_member' && (
              <button type="button" className={btn} disabled={!!busy} onClick={() => save(p, null)} title="Not a member's page: it won't be checked or counted">
                Not a member page
              </button>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-8">
      <datalist id="club-card-businesses">
        {businesses.map((b) => <option key={b.id} value={b.name} />)}
      </datalist>

      <section aria-labelledby="check-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h2 id="check-h" className="text-2xl font-semibold text-brand-dark" style={{ fontFamily: 'var(--font-serif)' }}>
            To check <span className="text-base text-gray-500">{toCheck.length}</span>
          </h2>
          {clearSuggestions.length > 1 && (
            <button type="button" className={btn} disabled={!!busy} onClick={confirmAll}>
              Confirm the {clearSuggestions.length} clear suggestions
            </button>
          )}
        </div>
        {toCheck.length === 0 ? (
          <p className="text-sm text-gray-500">Every page is matched. New pages show here after the nightly read when the match isn&apos;t certain.</p>
        ) : (
          <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06]">{toCheck.map(row)}</ul>
        )}
      </section>

      <details>
        <summary className="cursor-pointer text-lg font-semibold text-brand-dark">Matched <span className="text-sm text-gray-500">{matched.length}</span></summary>
        <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06] mt-2">{matched.map(row)}</ul>
      </details>

      {notMember.length > 0 && (
        <details>
          <summary className="cursor-pointer text-lg font-semibold text-brand-dark">Not member pages <span className="text-sm text-gray-500">{notMember.length}</span></summary>
          <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06] mt-2">{notMember.map(row)}</ul>
        </details>
      )}
    </div>
  )
}

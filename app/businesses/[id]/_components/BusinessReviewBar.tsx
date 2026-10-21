'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BusinessSelector } from '@/components/BusinessSelector'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { getBusinesses, type Business } from '@/app/actions/businesses'
import { markBusinessReviewed, markNotABusiness, moveBusinessInto, undoBusinessChange } from '@/app/actions/business-review'
import { toast } from '@/lib/toast'

interface Props {
  business: Pick<Business, 'id' | 'name' | 'status' | 'notes' | 'merged_into'>
}

// Records the inbound email path creates carry this note (route.ts)
const AUTO_CREATED_NOTE = 'Added automatically on '

/**
 * Review actions for a business added automatically from email: "This is a
 * business", "Not a business", or "Move to business" when it is really a
 * person at a business already on file. On a hidden or merged record it says
 * so and offers Undo instead.
 */
export function BusinessReviewBar({ business }: Props) {
  const router = useRouter()
  const isUnreviewed = business.status === 'Unreviewed'
  const isHidden = business.status === 'Not a business'
  // startsWith: a merge copies the source's notes onto the end of the target's
  const isAutoCreated = (business.notes ?? '').startsWith(AUTO_CREATED_NOTE)

  const [busy, setBusy] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [targetId, setTargetId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'hide' | 'move' | null>(null)

  useEffect(() => {
    if (!moveOpen || businesses.length > 0) return
    getBusinesses().then((result) => {
      const all = (result.data ?? []) as Business[]
      setBusinesses(all.filter((b) => b.id !== business.id && b.status !== 'Unreviewed'))
    })
  }, [moveOpen, businesses.length, business.id])

  if (!isUnreviewed && !isHidden && !isAutoCreated) return null

  const target = businesses.find((b) => b.id === targetId)

  const run = async (action: () => Promise<{ error?: string; name?: string }>, success: (name?: string) => string, then?: () => void) => {
    setBusy(true)
    const result = await action()
    setBusy(false)
    setConfirm(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(success(result.name))
    if (then) then()
    else router.refresh()
  }

  if (isHidden) {
    return (
      <div className="border border-gray-300 bg-brand-warm px-4 py-3 mb-6 text-sm flex flex-wrap items-center gap-3">
        <span className="text-gray-700">
          {business.merged_into
            ? 'This record was moved into another business. Its emails and contacts are there now.'
            : 'Marked Not a business: it is left out of every list. Its emails and contacts are kept here.'}
        </span>
        {business.merged_into && (
          <Link href={`/businesses/${business.merged_into}`} className="font-semibold text-brand-navy hover:underline">
            Open that business
          </Link>
        )}
        <button
          onClick={() => run(() => undoBusinessChange(business.id), () => 'Undone')}
          disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {busy ? 'Undoing…' : 'Undo'}
        </button>
      </div>
    )
  }

  return (
    <div className="border border-amber-200 bg-amber-50 px-4 py-3 mb-6 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-gray-800">
          {isUnreviewed ? 'Added automatically from an email and not reviewed yet.' : 'Added automatically from an email.'}
        </span>
        {isUnreviewed && (
          <button
            onClick={() => run(() => markBusinessReviewed(business.id), () => 'Marked as a business')}
            disabled={busy}
            className="text-xs font-semibold px-3 py-1.5 bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors"
          >
            This is a business
          </button>
        )}
        <button
          onClick={() => setMoveOpen((open) => !open)}
          disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 border border-brand-navy/30 text-brand-navy hover:bg-brand-navy/5 transition-colors"
        >
          Move to business…
        </button>
        <button
          onClick={() => setConfirm('hide')}
          disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Not a business
        </button>
      </div>

      {moveOpen && (
        <div className="mt-3 max-w-md space-y-2">
          <p className="text-gray-600">
            Pick the business this person or sender belongs to. Its emails, contacts, tasks and domain link move there,
            matching contacts are joined, and this record is hidden.
          </p>
          <BusinessSelector
            businesses={businesses}
            selectedBusinessId={targetId}
            onSelect={(id) => setTargetId(id || null)}
            onAddNew={() => {}}
          />
          <button
            onClick={() => setConfirm('move')}
            disabled={!targetId || busy}
            className={`text-xs font-semibold px-3 py-1.5 text-white transition-colors ${targetId && !busy ? 'bg-brand-navy hover:bg-brand-navy-hover' : 'bg-black/20 cursor-not-allowed'}`}
          >
            Move everything
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'hide'}
        onOpenChange={(open) => !open && setConfirm(null)}
        isLoading={busy}
        title="Not a business?"
        description={`${business.name} will be left out of every list and stop catching new mail. Its emails and contacts are kept, and open tasks on it are closed. You can undo this.`}
        confirmLabel="Not a business"
        onConfirm={() => run(() => markNotABusiness(business.id), () => 'Marked Not a business')}
      />
      <ConfirmDialog
        open={confirm === 'move'}
        onOpenChange={(open) => !open && setConfirm(null)}
        isLoading={busy}
        title={`Move into ${target?.name ?? 'this business'}?`}
        description={`Everything on ${business.name} moves to ${target?.name ?? 'the business you picked'}, and this record is hidden. You can undo this.`}
        confirmLabel="Move everything"
        onConfirm={() =>
          targetId &&
          run(
            () => moveBusinessInto(business.id, targetId),
            (name) => `Moved into ${name ?? target?.name ?? 'the business'}`,
            () => router.push(`/businesses/${targetId}`),
          )
        }
      />
    </div>
  )
}

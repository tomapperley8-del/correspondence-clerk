'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'
import { formatDateGB } from '@/lib/utils'
import { addForNewsletter } from '@/app/actions/calendar'

// "For newsletter" (UI overhaul Stage 12): puts an email, a business or a
// to-do on the "For Wednesday's newsletter" list on Today, as a For
// Newsletter task linked to it. Pressing it again does nothing new.

/** The button's work, for places that need it as a menu item (Today's More menu). */
export async function addToNewsletter(from: 'correspondence' | 'business' | 'task', id: string): Promise<boolean> {
  const result = await addForNewsletter(from, id)
  if (result.error) {
    toast.error(result.error)
    return false
  }
  const when = result.wednesday ? ` for ${formatDateGB(`${result.wednesday}T12:00:00Z`)}` : ''
  toast.success(result.already ? 'Already on the newsletter list' : `On the newsletter list${when}`)
  window.dispatchEvent(new Event('cc:calendar-changed'))
  return true
}

export function ForNewsletterButton({
  from,
  id,
  className,
  onAdded,
}: {
  from: 'correspondence' | 'business' | 'task'
  id: string
  className?: string
  onAdded?: () => void
}) {
  const [saving, setSaving] = useState(false)
  return (
    <button
      type="button"
      disabled={saving}
      title="Add this to the list for Wednesday's newsletter on Today"
      className={className}
      onClick={async () => {
        setSaving(true)
        const ok = await addToNewsletter(from, id)
        setSaving(false)
        if (ok) onAdded?.()
      }}
    >
      {saving ? 'Adding…' : 'For newsletter'}
    </button>
  )
}

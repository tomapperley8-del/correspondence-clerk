'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

// One line per item (UI overhaul Stage 14): a tag saying what kind it is, the
// name, a short detail and its age, then the most likely action as a button and
// the rest in a "More" menu. The list around it is a size container
// (`@container`), so the row stays on one line wherever there is room (a wide
// column, full screen) and wraps neatly in a narrow one or on a phone. Text that
// doesn't fit is cut with an ellipsis; the whole text is in the tooltip and read
// out by screen readers. In a narrow list the name and detail take two lines,
// with the buttons beside them.
// Reused by the Businesses table rows (Stage 13) and Inbox (14b).

export const rowButtonClass =
  'inline-flex items-center justify-center text-xs font-semibold px-2.5 min-h-10 md:min-h-8 pointer-coarse:min-h-10 border border-black/[0.12] rounded-sm bg-white text-brand-navy hover:bg-brand-warm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

/** Wrap rows in this so they can lay themselves out by the list's own width. */
export function ItemList({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn('@container divide-y divide-black/[0.06] border-y border-black/[0.06]', className)}>
      {children}
    </ul>
  )
}

export function ItemRow({
  tag,
  tagClassName,
  title,
  href,
  detail,
  meta,
  metaClassName,
  actions,
  below,
  className,
}: {
  tag: string
  /** Tag colours; the tag's words say the kind, so colour is never the only sign. */
  tagClassName?: string
  title: string
  href?: string | null
  detail?: string
  /** Age or date, e.g. "12 days overdue". */
  meta?: string
  metaClassName?: string
  /** The main button, then the More menu. */
  actions?: React.ReactNode
  /** Shown under the line, e.g. a "pick a date" form. */
  below?: React.ReactNode
  className?: string
}) {
  const full = [title, detail, meta].filter(Boolean).join(' · ')
  return (
    <li className={cn('py-2 px-1', className)}>
      <div className="grid gap-x-3 gap-y-1.5 items-center grid-cols-[minmax(0,1fr)_auto] @xl:grid-cols-[7rem_minmax(0,1fr)_auto_auto]">
        <span
          className={cn(
            'justify-self-start text-[11px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap max-w-full truncate col-start-1 row-start-1',
            tagClassName,
          )}
        >
          {tag}
        </span>
        <p
          className={cn(
            'text-xs whitespace-nowrap text-right col-start-2 row-start-1 @xl:col-start-3',
            metaClassName ?? 'text-gray-600',
          )}
        >
          {meta}
        </p>
        <p className="min-w-0 text-sm break-words line-clamp-2 col-start-1 row-start-2 @xl:block @xl:truncate @xl:col-start-2 @xl:row-start-1" title={full}>
          {href ? (
            <Link href={href} className="font-semibold text-brand-dark hover:underline">{title}</Link>
          ) : (
            <span className="font-semibold text-brand-dark">{title}</span>
          )}
          {detail && <span className="text-gray-700"> · {detail}</span>}
        </p>
        {actions && (
          <div className="flex gap-1.5 justify-end col-start-2 row-start-2 @xl:col-start-4 @xl:row-start-1">
            {actions}
          </div>
        )}
      </div>
      {below && <div className="mt-2">{below}</div>}
    </li>
  )
}

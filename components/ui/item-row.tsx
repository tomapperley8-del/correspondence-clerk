'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

// One line per item (UI overhaul Stage 14): the name, a short detail and its
// age, then the most likely action as a soft button and the rest in a "More"
// menu. Lists of mixed kinds are split under small group headings
// (ItemGroup) rather than a coloured tag on every line, so the page stays calm.
// The list is a size container (`@container`): the row is one line wherever
// there is room (a wide column, full screen); in a narrow one or on a phone the
// name and detail take up to two lines with the age under them and the buttons
// beside them. Cut text is in the tooltip and read out in full by screen readers.
// Reused by the Businesses table rows (Stage 13) and Inbox (14b).

const buttonBase =
  'inline-flex items-center justify-center gap-1 text-xs font-semibold px-2.5 min-h-10 md:min-h-8 pointer-coarse:min-h-10 rounded-sm transition-colors duration-200 ease-out disabled:opacity-50 whitespace-nowrap'

/** The main action on a row: a soft filled button. */
export const rowButtonClass = `${buttonBase} bg-brand-navy/[0.07] text-brand-navy hover:bg-brand-navy/[0.14]`

/** Secondary actions (More, Cancel): text only until hovered. */
export const rowQuietButtonClass = `${buttonBase} text-gray-700 hover:bg-black/[0.05] hover:text-brand-dark`

/** Wrap rows in this so they can lay themselves out by the list's own width. */
export function ItemList({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn('@container divide-y divide-black/[0.05]', className)}>
      {children}
    </ul>
  )
}

/** A small heading over a run of rows of one kind ("Money owed 5"). The dot is decoration; the words say the kind. */
export function ItemGroup({
  title,
  count,
  dotClassName,
  children,
}: {
  title: string
  count?: number
  dotClassName?: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="flex items-center gap-2 !text-[11px] !leading-4 font-semibold uppercase tracking-wide text-gray-600 pb-1">
        {dotClassName && <span aria-hidden="true" className={cn('size-2 rounded-full', dotClassName)} />}
        {title}
        {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
      </h3>
      <ItemList label={title}>{children}</ItemList>
    </div>
  )
}

export function ItemRow({
  tag,
  title,
  href,
  detail,
  meta,
  metaTitle,
  late,
  actions,
  below,
  className,
}: {
  /** A short kind label, only where a list mixes kinds without group headings. */
  tag?: string
  title: string
  href?: string | null
  detail?: string
  /** Age or date, e.g. "12 days overdue". */
  meta?: string
  /** The exact date behind the age, shown on hover. */
  metaTitle?: string
  /** Past a real deadline: the age turns red (its words already say "overdue" or "ended"). */
  late?: boolean
  /** The main button, then the More menu. */
  actions?: React.ReactNode
  /** Shown under the line, e.g. a "pick a date" form. */
  below?: React.ReactNode
  className?: string
}) {
  const full = [tag, title, detail, meta, metaTitle].filter(Boolean).join(' · ')
  return (
    <li className={cn('py-2 px-2 -mx-2 rounded-sm transition-colors duration-200 ease-out hover:bg-brand-warm', className)}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 @xl:flex @xl:items-baseline @xl:gap-4">
          <p className="min-w-0 text-sm line-clamp-2 break-words @xl:block @xl:truncate @xl:flex-1" title={full}>
            {tag && <span className="text-xs font-semibold text-gray-600 mr-1.5">{tag}</span>}
            {href ? (
              <Link href={href} className="font-semibold text-brand-dark hover:underline">{title}</Link>
            ) : (
              <span className="font-semibold text-brand-dark">{title}</span>
            )}
            {detail && <span className="text-gray-600"> · {detail}</span>}
          </p>
          {meta && (
            <p title={metaTitle} className={cn('text-xs whitespace-nowrap mt-0.5 @xl:mt-0', late ? 'text-red-700' : 'text-gray-600')}>
              {meta}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
      {below && <div className="mt-2">{below}</div>}
    </li>
  )
}

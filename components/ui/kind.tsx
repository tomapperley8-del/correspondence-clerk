import { cn } from '@/lib/utils'

// House style (Stage 14d, Decision 30 Oct 2026): one colour per kind of thing,
// the same everywhere (Today, the calendar, every tab), always shown with its
// name so nothing is told by colour alone. Colours live in app/globals.css
// (`--kind-*`); class names are spelt out here so Tailwind can see them.

export type KindColour =
  | 'todo'
  | 'attention'
  | 'money'
  | 'renewal'
  | 'waiting'
  | 'card'
  | 'newsletter'
  | 'outreach'
  | 'overdue'
  | 'neutral'

export const KIND: Record<KindColour, { band: string; text: string; soft: string; edge: string; dot: string }> = {
  todo: { band: 'bg-kind-todo', text: 'text-kind-todo', soft: 'bg-kind-todo-soft', edge: 'border-kind-todo', dot: 'bg-kind-todo' },
  attention: { band: 'bg-kind-attention', text: 'text-kind-attention', soft: 'bg-kind-attention-soft', edge: 'border-kind-attention', dot: 'bg-kind-attention' },
  money: { band: 'bg-kind-money', text: 'text-kind-money', soft: 'bg-kind-money-soft', edge: 'border-kind-money', dot: 'bg-kind-money' },
  renewal: { band: 'bg-kind-renewal', text: 'text-kind-renewal', soft: 'bg-kind-renewal-soft', edge: 'border-kind-renewal', dot: 'bg-kind-renewal' },
  waiting: { band: 'bg-kind-waiting', text: 'text-kind-waiting', soft: 'bg-kind-waiting-soft', edge: 'border-kind-waiting', dot: 'bg-kind-waiting' },
  card: { band: 'bg-kind-card', text: 'text-kind-card', soft: 'bg-kind-card-soft', edge: 'border-kind-card', dot: 'bg-kind-card' },
  newsletter: { band: 'bg-kind-newsletter', text: 'text-kind-newsletter', soft: 'bg-kind-newsletter-soft', edge: 'border-kind-newsletter', dot: 'bg-kind-newsletter' },
  outreach: { band: 'bg-kind-outreach', text: 'text-kind-outreach', soft: 'bg-kind-outreach-soft', edge: 'border-kind-outreach', dot: 'bg-kind-outreach' },
  overdue: { band: 'bg-kind-overdue', text: 'text-kind-overdue', soft: 'bg-kind-overdue-soft', edge: 'border-kind-overdue', dot: 'bg-kind-overdue' },
  neutral: { band: 'bg-kind-neutral', text: 'text-kind-neutral', soft: 'bg-kind-neutral-soft', edge: 'border-kind-neutral', dot: 'bg-kind-neutral' },
}

/** The CSS variables a band's controls read (white buttons in the band's colour). */
export function bandStyle(kind: KindColour): React.CSSProperties {
  return { ['--band' as string]: `var(--kind-${kind})`, ['--band-soft' as string]: `var(--kind-${kind}-soft)` }
}

/** Classes for a header band: solid colour, white text. */
export function bandClass(kind: KindColour) {
  return cn('cc-band text-white', KIND[kind].band)
}

/** A small named tag in a kind's colour, such as "Renewal" beside a row. */
export function KindTag({ kind, children, className }: { kind: KindColour; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('shrink-0 inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full', KIND[kind].soft, KIND[kind].text, className)}>
      {children}
    </span>
  )
}

/** The colour of each Needs attention reason (v_business_attention). */
export const REASON_KIND: Record<'money_owed' | 'renewal' | 'club_card_lapsed' | 'waiting_on_you' | 'todo' | 'club_card', KindColour> = {
  money_owed: 'money',
  renewal: 'renewal',
  club_card_lapsed: 'card',
  waiting_on_you: 'waiting',
  todo: 'todo',
  club_card: 'card',
}

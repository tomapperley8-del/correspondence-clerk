/**
 * Business categories: the website's seven Club Card categories (Stage 11b, Tom's choice
 * 22 Oct 2026). Colleagues, councils and community groups have none.
 */
export const BUSINESS_CATEGORIES = [
  'Food & Drink',
  'Health & Beauty',
  'Retail',
  'Entertainment',
  'Activities',
  'Services',
  'For Children',
] as const

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number]

/** The seven, plus any older value a business still holds, so a select never hides it. */
export function categoryOptions(current?: string | null): string[] {
  const seven: string[] = [...BUSINESS_CATEGORIES]
  return current && !seven.includes(current) ? [...seven, current] : seven
}

// Words in a prospect lead's own category that point to one of the seven, checked in this order
// (a "health food café & gym" is Activities; "homeware, clothing & beauty retail" is Retail).
const GUESS: [RegExp, BusinessCategory][] = [
  [/child|kids|nursery|baby|toddler|tutor/i, 'For Children'],
  [/gym|yoga|pilates|fitness|sport|dance|climb|swim|martial|karate|boxing|tennis|golf/i, 'Activities'],
  [/retail|shop|boutique|store|homeware|clothing|florist|gallery|furniture|antique|books/i, 'Retail'],
  [/restaurant|caf[eé]|pizza|pub\b|bar\b|bakery|food|coffee|wine|deli|kitchen|bistro/i, 'Food & Drink'],
  [/beauty|hair|salon|spa\b|skin|aesthetic|clinic|dental|dentist|physio|health|wellness|nails|barber/i, 'Health & Beauty'],
  [/theatre|cinema|music|entertain|comedy|venue|festival/i, 'Entertainment'],
  [/service|decorat|plumb|build|estate agent|account|legal|solicitor|clean|garden|design|repair/i, 'Services'],
]

/** One of the seven for free text such as a prospect lead's category, or null when nothing fits. */
export function guessCategory(text: string | null | undefined): BusinessCategory | null {
  if (!text) return null
  const hit = GUESS.find(([rx]) => rx.test(text))
  return hit ? hit[1] : null
}

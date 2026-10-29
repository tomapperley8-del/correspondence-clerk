/**
 * When in the month a regular usually appears (Stage 16a, Tom 29 Oct: "which part of the month").
 * Issues go out on Wednesdays, so an issue is the 1st to 5th Wednesday of its month. Plain counts
 * over a contributor's last 12 appearances, so a column that moved (Rosie Fyles since January) shows
 * its new habit.
 */

export type UsualWeek = { weeks: number[]; hits: number; of: number }

/** 1 for the 1st Wednesday of the month (days 1 to 7), up to 5. */
export const nthWednesday = (isoDate: string) => Math.floor((Number(isoDate.slice(8, 10)) - 1) / 7) + 1

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th']

/** "1st Wednesday", "2nd or 3rd Wednesday" or "1st to 3rd Wednesday". */
export const weekWords = (weeks: number[]) =>
  `${weeks.length === 3 ? `${ORDINAL[weeks[0]]} to ${ORDINAL[weeks[2]]}` : weeks.map((w) => ORDINAL[w]).join(' or ')} Wednesday`

/**
 * One week when it holds at least 60% of the last 12 appearances; two weeks when together they hold
 * 70%; three weeks in a row (1st to 3rd) when they hold 85%; otherwise no habit. Needs 6 appearances,
 * so a series with a handful of pieces doesn't show a habit it hasn't got.
 */
export function usualWeek(issueDates: string[]): UsualWeek | null {
  const recent = [...new Set(issueDates)].sort().slice(-12)
  if (recent.length < 6) return null
  const n = [0, 0, 0, 0, 0, 0]
  for (const d of recent) n[nthWednesday(d)] += 1
  const [a, b] = [1, 2, 3, 4, 5].sort((x, y) => n[y] - n[x] || x - y)
  if (n[a] / recent.length >= 0.6) return { weeks: [a], hits: n[a], of: recent.length }
  if ((n[a] + n[b]) / recent.length >= 0.7) return { weeks: [a, b].sort(), hits: n[a] + n[b], of: recent.length }
  for (const start of [1, 2, 3]) {
    const hits = n[start] + n[start + 1] + n[start + 2]
    if (hits / recent.length >= 0.85) return { weeks: [start, start + 1, start + 2], hits, of: recent.length }
  }
  return null
}

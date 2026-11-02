// An ongoing (no end date) contract keeps the placeholder end 2030-01-01 (enforced by a trigger),
// so readers that only see contract_end can still tell it from a dated end.
export const ONGOING_END = '2030-01-01'
export const isOngoingEnd = (end: string | null | undefined) => !!end && end.slice(0, 10) >= ONGOING_END

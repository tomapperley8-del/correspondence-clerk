/**
 * Centralised app events — custom event dispatchers.
 * Follows the same pattern as lib/toast.ts.
 */

export const appEvents = {
  businessesChanged: () => window.dispatchEvent(new CustomEvent('businesses:changed')),
}

/**
 * Standardised result types for server actions and API routes.
 *
 * Server actions return ActionResult<T>.
 * API routes use consistent HTTP status codes + requestId on errors.
 */

/** Discriminated union for server action returns */
export type ActionResult<T> =
  | { data: T; error?: never }
  | { error: string; code?: string; data?: never }

/** Standard API error shape (returned as JSON body) */
export type ApiError = {
  error: string
  code?: string
  requestId?: string
}

/** Generate a unique request ID for error tracking */
export function generateRequestId(): string {
  return crypto.randomUUID()
}

/** Helper to create a success result */
export function ok<T>(data: T): ActionResult<T> {
  return { data }
}

/** Helper to create an error result */
export function err<T = never>(error: string, code?: string): ActionResult<T> {
  return code ? { error, code } : { error }
}

/**
 * Shared token persistence helpers for OAuth import routes.
 * Extracted to avoid duplicating the same DB update in scan + execute routes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any

export function makeGmailTokenRefreshHandler(serviceClient: ServiceClient, userId: string) {
  return async (newAccessToken: string, newExpiry: Date | null) => {
    await serviceClient
      .from('user_profiles')
      .update({
        google_access_token: newAccessToken,
        google_token_expiry: newExpiry?.toISOString() ?? null,
      })
      .eq('id', userId)
  }
}

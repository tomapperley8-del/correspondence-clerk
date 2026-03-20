/**
 * Feature flags for controlling feature availability
 * All flags default to false for safe deployment
 */
export const FEATURES = {
  billing: process.env.FEATURE_BILLING_ENABLED === 'true',
  publicSignup: process.env.FEATURE_PUBLIC_SIGNUP === 'true',
  landingPage: process.env.FEATURE_LANDING_PAGE === 'true',
  customDomains: process.env.FEATURE_CUSTOM_DOMAINS === 'true',
  apiAccess: process.env.FEATURE_API_ACCESS === 'true',
  sso: process.env.FEATURE_SSO === 'true',
  branding: process.env.FEATURE_BRANDING === 'true',
} as const

export type FeatureFlag = keyof typeof FEATURES

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  return FEATURES[feature]
}

/**
 * Get all enabled features (useful for debugging)
 */
export function getEnabledFeatures(): FeatureFlag[] {
  return (Object.keys(FEATURES) as FeatureFlag[]).filter(
    (feature) => FEATURES[feature]
  )
}

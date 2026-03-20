import { describe, it, expect, beforeEach, vi } from 'vitest'

// We need to test the feature flags with different env values
// Since the module reads env at import time, we need to handle this carefully

describe('Feature Flags', () => {
  describe('FEATURES object', () => {
    it('should have all expected feature flags defined', async () => {
      // Reset modules to get fresh import
      vi.resetModules()

      const { FEATURES } = await import('@/lib/feature-flags')

      expect(FEATURES).toHaveProperty('billing')
      expect(FEATURES).toHaveProperty('publicSignup')
      expect(FEATURES).toHaveProperty('landingPage')
      expect(FEATURES).toHaveProperty('customDomains')
      expect(FEATURES).toHaveProperty('apiAccess')
      expect(FEATURES).toHaveProperty('sso')
      expect(FEATURES).toHaveProperty('branding')
    })

    it('should default to false for disabled features', async () => {
      vi.resetModules()

      // Clear the env vars
      delete process.env.FEATURE_BILLING_ENABLED
      delete process.env.FEATURE_PUBLIC_SIGNUP
      delete process.env.FEATURE_CUSTOM_DOMAINS
      delete process.env.FEATURE_API_ACCESS
      delete process.env.FEATURE_SSO
      delete process.env.FEATURE_BRANDING

      const { FEATURES } = await import('@/lib/feature-flags')

      expect(FEATURES.billing).toBe(false)
      expect(FEATURES.publicSignup).toBe(false)
      expect(FEATURES.customDomains).toBe(false)
      expect(FEATURES.apiAccess).toBe(false)
      expect(FEATURES.sso).toBe(false)
      expect(FEATURES.branding).toBe(false)
    })

    it('should be true when env var is "true"', async () => {
      vi.resetModules()

      process.env.FEATURE_BILLING_ENABLED = 'true'
      process.env.FEATURE_LANDING_PAGE = 'true'

      const { FEATURES } = await import('@/lib/feature-flags')

      expect(FEATURES.billing).toBe(true)
      expect(FEATURES.landingPage).toBe(true)
    })

    it('should be false when env var is anything other than "true"', async () => {
      vi.resetModules()

      process.env.FEATURE_BILLING_ENABLED = 'false'
      process.env.FEATURE_PUBLIC_SIGNUP = 'yes'
      process.env.FEATURE_CUSTOM_DOMAINS = '1'
      process.env.FEATURE_API_ACCESS = 'TRUE' // Case sensitive

      const { FEATURES } = await import('@/lib/feature-flags')

      expect(FEATURES.billing).toBe(false)
      expect(FEATURES.publicSignup).toBe(false)
      expect(FEATURES.customDomains).toBe(false)
      expect(FEATURES.apiAccess).toBe(false)
    })
  })

  describe('isFeatureEnabled', () => {
    it('should return the correct boolean for each feature', async () => {
      vi.resetModules()

      process.env.FEATURE_BILLING_ENABLED = 'true'
      process.env.FEATURE_LANDING_PAGE = 'true'
      delete process.env.FEATURE_PUBLIC_SIGNUP

      const { isFeatureEnabled } = await import('@/lib/feature-flags')

      expect(isFeatureEnabled('billing')).toBe(true)
      expect(isFeatureEnabled('landingPage')).toBe(true)
      expect(isFeatureEnabled('publicSignup')).toBe(false)
    })
  })

  describe('getEnabledFeatures', () => {
    it('should return array of enabled feature keys', async () => {
      vi.resetModules()

      process.env.FEATURE_BILLING_ENABLED = 'true'
      process.env.FEATURE_LANDING_PAGE = 'true'
      process.env.FEATURE_SSO = 'true'
      delete process.env.FEATURE_PUBLIC_SIGNUP
      delete process.env.FEATURE_CUSTOM_DOMAINS
      delete process.env.FEATURE_API_ACCESS
      delete process.env.FEATURE_BRANDING

      const { getEnabledFeatures } = await import('@/lib/feature-flags')

      const enabled = getEnabledFeatures()

      expect(enabled).toContain('billing')
      expect(enabled).toContain('landingPage')
      expect(enabled).toContain('sso')
      expect(enabled).not.toContain('publicSignup')
      expect(enabled).not.toContain('customDomains')
    })

    it('should return empty array when no features are enabled', async () => {
      vi.resetModules()

      delete process.env.FEATURE_BILLING_ENABLED
      delete process.env.FEATURE_PUBLIC_SIGNUP
      delete process.env.FEATURE_LANDING_PAGE
      delete process.env.FEATURE_CUSTOM_DOMAINS
      delete process.env.FEATURE_API_ACCESS
      delete process.env.FEATURE_SSO
      delete process.env.FEATURE_BRANDING

      const { getEnabledFeatures } = await import('@/lib/feature-flags')

      const enabled = getEnabledFeatures()

      expect(enabled).toHaveLength(0)
    })
  })
})

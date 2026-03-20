import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock environment variables for tests
process.env.FEATURE_BILLING_ENABLED = 'false'
process.env.FEATURE_PUBLIC_SIGNUP = 'false'
process.env.FEATURE_LANDING_PAGE = 'true'
process.env.FEATURE_CUSTOM_DOMAINS = 'false'
process.env.FEATURE_API_ACCESS = 'false'
process.env.FEATURE_SSO = 'false'
process.env.FEATURE_BRANDING = 'false'

// Mock Supabase client for tests that don't need it
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
    })),
  })),
}))

// Mock Anthropic client
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      messages: {
        create: vi.fn(),
      },
    },
  })),
}))

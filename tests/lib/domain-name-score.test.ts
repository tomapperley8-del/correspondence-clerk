import { describe, it, expect } from 'vitest'
import { domainBusinessNameScore } from '@/lib/inbound/utils'

// A score of 0.6 or more auto-files the email and learns a domain mapping.
const GOOD = 0.6

describe('domainBusinessNameScore', () => {
  it('matches a domain that is the business name', () => {
    expect(domainBusinessNameScore('smithplumbing.co.uk', 'Smith Plumbing')).toBe(1)
    expect(domainBusinessNameScore('operahollandpark.com', 'Opera Holland Park')).toBe(1)
    expect(domainBusinessNameScore('svlondon.com', 'S&V LONDON')).toBe(1)
    expect(domainBusinessNameScore('bqchiswick.co.uk', 'B&Q CHISWICK')).toBe(1)
  })

  it('matches when one contains the other and more than a place name is shared', () => {
    expect(domainBusinessNameScore('tabard.org.uk', 'Theatre at the Tabard')).toBeGreaterThanOrEqual(GOOD)
    expect(domainBusinessNameScore('chiswickpier.org.uk', 'Chiswick Pier Trust')).toBeGreaterThanOrEqual(GOOD)
    expect(domainBusinessNameScore('thehoundw4.co.uk', 'The Hound')).toBeGreaterThanOrEqual(GOOD)
  })

  // Found on live, 30 Oct 2026: each of these was auto-filed and learned as a mapping.
  it('never matches on a place word alone', () => {
    expect(domainBusinessNameScore('chiswickchamberorchestra.org', 'B&Q CHISWICK')).toBeLessThan(GOOD)
    expect(domainBusinessNameScore('chiswickcalendar.co.uk', 'B&Q CHISWICK')).toBeLessThan(GOOD)
    expect(domainBusinessNameScore('london-fire.gov.uk', 'S&V LONDON')).toBeLessThan(GOOD)
    expect(domainBusinessNameScore('londoncouncils.gov.uk', 'S&V LONDON')).toBeLessThan(GOOD)
    expect(domainBusinessNameScore('actionwestlondon.org.uk', 'S&V LONDON')).toBeLessThan(GOOD)
    expect(domainBusinessNameScore('sportspasslondon.com', 'S&V LONDON')).toBeLessThan(GOOD)
    expect(domainBusinessNameScore('chiswick.org', 'Chiswick Pier Trust')).toBeLessThan(GOOD)
    expect(domainBusinessNameScore('chiswickw4.co.uk', 'W4 Wellness')).toBeLessThan(GOOD)
  })

  it('scores the company part, not a mail subdomain', () => {
    expect(domainBusinessNameScore('email.stripe.com', 'Mail')).toBeLessThan(GOOD)
  })
})

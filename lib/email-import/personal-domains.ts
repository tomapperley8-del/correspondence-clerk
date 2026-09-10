/**
 * Common personal email domains where the domain tells us nothing about the business.
 * For these, we use the sender's display name as the business name instead.
 */
export const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'tutanota.com',
  'zoho.com',
  'fastmail.com',
  'fastmail.fm',
  // UK consumer ISP domains. Broadband providers, not business identities,
  // and several collide with real business names (virgin.net, sky.com).
  'virgin.net',
  'virginmedia.com',
  'btinternet.com',
  'btconnect.com',
  'sky.com',
  'talktalk.net',
  'tiscali.co.uk',
  'blueyonder.co.uk',
  'ntlworld.com',
  'gmx.net',
  'gmx.com',
  'zen.co.uk',
  'plus.net',
])

export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase())
}

// Club Card pages on the website (UI overhaul Stage 6b). Pure functions that
// read the public WordPress page list and the public Google My Maps KML.
// Read-only: nothing here writes to the website. See docs/ui-overhaul-plan.md,
// "Club Card tab (Stage 6b)".

export const CLUB_CARD_PARENT_ID = 97569
export const SITE = 'https://chiswickcalendar.co.uk'
export const MAP_KML_URL = 'https://www.google.com/maps/d/kml?mid=16heELEiXU-sX1iqn_SUnYKMX6PdlfgC2&forcekml=1'
/** An honest agent. The site's bot check blocks `Mozilla/5.0 (compatible; ...)` agents; this one is let through. */
export const USER_AGENT = 'CorrespondenceClerk/1.0'

export const AZ_SLUG = 'a-z-directory'
export const LATEST_SLUG = 'club-card-latest-offers'
export const MAP_SLUG = 'club-card-map'
/** Category pages, slug to the label Tom sees. */
export const CATEGORY_SLUGS: Record<string, string> = {
  'club-card-food-and-drink': 'Food & drink',
  'health-and-beauty': 'Health & beauty',
  'club-card-retail': 'Retail',
  'club-card-entertainment': 'Entertainment',
  'club-card-activities': 'Activities',
  'club-card-services': 'Services',
  'club-card-children': 'Children',
}
export const HUB_SLUGS = new Set([AZ_SLUG, LATEST_SLUG, MAP_SLUG, ...Object.keys(CATEGORY_SLUGS)])

export type WpPage = {
  id: number
  slug: string
  link: string
  modified_gmt?: string
  modified: string
  title: { rendered: string }
  content: { rendered: string }
}

export type ParsedPage = {
  wp_id: number
  slug: string
  link: string
  title: string
  wp_modified: string
  offer_text: string | null
  offer_ends_on: string | null
  page_address: string | null
  page_postcode: string | null
  page_phone: string | null
  page_website: string | null
  page_email: string | null
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', pound: '£', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** HTML to plain text, keeping paragraph and line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The HTML under an `<h3>` heading matching `heading`, up to the next h2/h3. */
function section(html: string, heading: RegExp): string | null {
  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (!heading.test(htmlToText(m[2]))) continue
    const start = m.index + m[0].length
    const next = html.slice(start).search(/<h[23][^>]*>/i)
    return next === -1 ? html.slice(start) : html.slice(start, start + next)
  }
  return null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * An end date written as a plain date ("until 30 November", "ends 1st Dec 2026").
 * Without a year, the first such date on or after the page's last edit.
 * Wording like "Autumn 2026" is not read; Tom sets those dates himself.
 */
export function parseOfferEnd(offer: string, modified: string): string | null {
  const m = offer.match(
    /\b(?:until|till|til|ends?|ending|expires?|expiring|valid (?:until|till|to|through)|runs? (?:until|till|to)|up to|before|by)\s+(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?(?:\s+(\d{4}))?/i,
  )
  if (!m) return null
  const day = Number(m[1])
  const month = MONTHS.indexOf(m[2].toLowerCase())
  const edited = modified.slice(0, 10)
  let year = m[3] ? Number(m[3]) : Number(edited.slice(0, 4))
  const iso = (y: number) => `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (!m[3] && iso(year) < edited) year += 1
  const d = new Date(Date.UTC(year, month, day))
  if (d.getUTCMonth() !== month) return null
  return iso(year)
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

export function normalisePostcode(s: string | null | undefined): string | null {
  const m = (s ?? '').match(POSTCODE)
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : null
}

/** UK phone to bare national digits ("020 8994 0828", "+44 20 8994 0828" -> "02089940828"). */
export function normalisePhone(s: string | null | undefined): string | null {
  let d = (s ?? '').replace(/\D/g, '')
  if (d.startsWith('44')) d = '0' + d.slice(2)
  if (d.startsWith('00')) d = d.slice(1)
  return d.length >= 10 ? d : null
}

/** Registrable-ish host: lower case, no scheme, no `www.`, no path. */
export function normaliseHost(s: string | null | undefined): string | null {
  const m = (s ?? '').trim().toLowerCase().match(/^(?:[a-z]+:\/\/)?(?:www\.)?([^/?#\s:@]+)/)
  return m && m[1].includes('.') ? m[1] : null
}

const IGNORE_HOSTS = /(^|\.)(chiswickcalendar\.co\.uk|google\.[a-z.]+|goo\.gl|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|linkedin\.com|youtube\.com|eventbrite\.[a-z.]+|wa\.me)$/

export function parseMemberPage(p: WpPage): ParsedPage {
  const html = p.content.rendered
  const offerHtml = section(html, /^club card offers?\b/i)
  const offer = offerHtml ? htmlToText(offerHtml) || null : null
  const contactHtml = section(html, /^contact/i) ?? ''
  const contactText = htmlToText(contactHtml)

  const hrefs = [...contactHtml.matchAll(/href="([^"]+)"/gi)].map((m) => decodeEntities(m[1]))
  const website = hrefs.find((h) => /^https?:/i.test(h) && !IGNORE_HOSTS.test(normaliseHost(h) ?? '')) ?? null
  const email = hrefs.find((h) => /^mailto:/i.test(h))?.slice(7).split('?')[0].trim().toLowerCase()
    ?? contactText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0].toLowerCase() ?? null
  const phone = contactText.match(/(?:tel|phone|t)\s*[:.]?\s*(\+?[\d][\d ()-]{8,}\d)/i)?.[1]
    ?? contactText.match(/(?:^|\s)((?:\+44\s?|0)\d[\d ]{8,12}\d)/)?.[1] ?? null
  // The address is the contact block's lines before the phone, website or email.
  const addressLines: string[] = []
  for (const line of contactText.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (/^(tel|phone|t\b|e\b|email|w\b|web|www\.|https?:|book|open|opening)/i.test(line) || /@/.test(line) || normaliseHost(line) === line.toLowerCase().replace(/^www\./, '')) break
    addressLines.push(line)
    if (POSTCODE.test(line)) break
  }
  const address = addressLines.length ? addressLines.join(', ') : null

  return {
    wp_id: p.id,
    slug: p.slug,
    link: p.link,
    title: htmlToText(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '') || htmlToText(p.title.rendered),
    wp_modified: p.modified_gmt ? p.modified_gmt + 'Z' : p.modified,
    offer_text: offer,
    offer_ends_on: offer ? parseOfferEnd(offer, p.modified) : null,
    page_address: address,
    page_postcode: normalisePostcode(address) ?? normalisePostcode(contactText),
    page_phone: phone ? phone.replace(/\s+/g, ' ').trim() : null,
    page_website: website,
    page_email: email,
  }
}

/** The slug a link points at, for links to member pages anywhere on the site. */
export function slugFromLink(href: string): string | null {
  const m = decodeEntities(href).match(/^https?:\/\/(?:www\.)?chiswickcalendar\.co\.uk\/(?:chiswick-club-card-offers\/)?([a-z0-9-]+)\/?(?:[?#].*)?$/i)
  return m ? m[1].toLowerCase() : null
}

/** Every link to a page on the site, in order, as slugs (duplicates kept). */
export function linkedSlugs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/gi)]
    .map((m) => slugFromLink(m[1]))
    .filter((s): s is string => !!s && !HUB_SLUGS.has(s) && s !== 'chiswick-club-card-offers')
}

export type MapPlace = { name: string; folder: string | null; slug: string | null }

/** Places on the Club Card map, with their folder (category) and the member page they link. */
export function parseMapKml(kml: string): MapPlace[] {
  const places: MapPlace[] = []
  for (const f of kml.matchAll(/<Folder>([\s\S]*?)<\/Folder>/g)) {
    const folder = htmlToText((f[1].match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '')) || null
    for (const pm of f[1].matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const name = htmlToText((pm[1].match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, ''))
      const desc = (pm[1].match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '')
      const url = desc.match(/https?:\/\/(?:www\.)?chiswickcalendar\.co\.uk\/[^\s<"]+/i)?.[0]
      places.push({ name, folder, slug: url ? slugFromLink(url.replace(/[).,]+$/, '')) : null })
    }
  }
  return places
}

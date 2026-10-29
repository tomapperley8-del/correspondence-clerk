/**
 * Splits one newsletter issue's text into its items (Stage 16a, the Newsletter tab). Plain rules, no AI.
 *
 * The text (archive.ts htmlToTextWithLinks) is paragraphs separated by blank lines, links kept as
 * "label (url)". A story is an optional photo caption, a headline, the blurb and "Read more (url)".
 * Section headers stand alone: CLUB CARD, WHAT'S ON, COLUMNISTS. "More news stories ..." is a list of
 * linked headlines ending "Read all news stories". A bare link that isn't to the Calendar's own site is
 * a banner ad. The support appeal and Mailchimp's footer close the issue.
 */

export type ItemSection = 'top' | 'more_news' | 'features' | 'club_card' | 'whats_on' | 'jazz' | 'columnists' | 'footer'
export type ItemKind =
  | 'news' | 'more_news' | 'feature' | 'guest_blog' | 'column' | 'review' | 'freebie' | 'competition'
  | 'club_card_join' | 'club_card_offer' | 'club_card_event' | 'market' | 'whats_on' | 'jazz' | 'banner' | 'appeal' | 'other'

export interface SplitItem {
  position: number
  section: ItemSection
  kind: ItemKind
  headline: string | null
  blurb: string | null
  link_url: string | null
  closes_on: string | null
  /** Headline, blurb and caption together, for matching businesses and contributors */
  text: string
}

const OWN_SITE = /^https?:\/\/(www\.)?(chiswickcalendar\.co\.uk|thechiswickcalendar\.co\.uk|mailchi\.mp|[a-z0-9.-]*list-manage\.com|[a-z0-9.-]*campaign-archive\.com|eepurl\.com)/i
const BARE_URL = /^\(?https?:\/\/\S+\)?$/
const READ_MORE = /^Read [Mm]ore[.…]*\s*(?:\((https?:\/\/[^)]+)\))?\s*$/
const LINKED = /^(.*?)\s*\((https?:\/\/[^)]+)\)\s*(\S{0,3})$/

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const stripLinks = (s: string) => s.replace(/\s*\(https?:\/\/[^)]*\)/g, '').replace(/\s+/g, ' ').trim()

/** "by 10.00pm on Friday 30 October" → the date, in the issue's year (or the next, for a December issue). */
export function closingDate(text: string, issueDate: string): string | null {
  const m = text.match(/\b(?:by|before|closes?(?: on)?|deadline(?: is)?)\b[^.]{0,40}?\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toLowerCase())
  let year = Number(issueDate.slice(0, 4))
  if (month < Number(issueDate.slice(5, 7)) - 2) year += 1
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
}

function kindOf(section: ItemSection, text: string): ItemKind {
  const t = text.toLowerCase()
  if (section === 'footer') return 'appeal'
  if (/freebie/.test(t) || (/\bwin\b/.test(t) && /quiz question|to be in with a chance|enter/.test(t))) return 'freebie'
  if (/exclusive(ly)? (to|for) (chiswick calendar )?club card/.test(t)) return 'club_card_event'
  if (/guest blog|guest column|this month'?s blog|read (his|her|their) blog|read [a-z]+'s blog/.test(t)) return 'guest_blog'
  if (section === 'club_card') {
    if (/\b(re)?joins? the (chiswick calendar )?club card|welcome .{0,40}to the club card/.test(t)) return 'club_card_join'
    if (/offers a club card scheme with lots of local businesses/.test(t)) return 'other'
    return 'club_card_offer'
  }
  if (/\b(re)?joins? the (chiswick calendar )?club card/.test(t)) return 'club_card_join'
  if (section === 'jazz' || (/jazz at george iv/.test(t) && /\b(monday|thursday|sunday) \d{1,2}\b/.test(t) && /tickets/.test(t))) return 'jazz'
  if (section === 'columnists') return /review/.test(t) ? 'review' : 'column'
  if (/\bcompetition\b/.test(t)) return 'competition'
  if (/(cheese|flower|food st|farmers'?|vintage|lazy flea|artisan|christmas|makers'?) market\b/.test(t)) return 'market'
  if (section === 'whats_on') return /what'?s on in and around chiswick/.test(t) ? 'other' : 'whats_on'
  if (section === 'top') return 'news'
  return 'feature'
}

/** A paragraph of running text (ends like a sentence), as opposed to a photo caption or a headline. */
const isProse = (s: string) => /[.!]["”’']?$/.test(s) || (/[?"”]$/.test(s) && s.length > 160)

/** Headline and blurb from a story's paragraphs: photo captions come first, the headline is the last of them before the text. */
function headlineAndBlurb(paras: string[]): { headline: string | null; blurb: string | null } {
  const p = paras.map(stripLinks).filter(Boolean)
  if (!p.length) return { headline: null, blurb: null }
  const firstProse = p.findIndex(isProse)
  const h = firstProse > 0 ? firstProse - 1 : 0
  return { headline: p[h], blurb: p.slice(firstProse > 0 ? firstProse : 1).join('\n\n') || null }
}

export function splitIssue(plainText: string, issueDate: string): SplitItem[] {
  const paras = plainText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

  // Skip the masthead: everything up to the "pass it on / sign up" paragraph
  let i = paras.findIndex((p) => /New subscribers sign up here|pass it on/i.test(p))
  i = i >= 0 ? i + 1 : 0

  const items: SplitItem[] = []
  let section: ItemSection = 'top'
  let buf: string[] = []
  const push = (kind: ItemKind | null, headline: string | null, blurb: string | null, link: string | null, raw: string[]) => {
    const text = stripLinks(raw.join(' '))
    if (!text && !link) return
    const k = kind ?? kindOf(section, text)
    items.push({
      position: items.length + 1, section, kind: k, headline, blurb, link_url: link,
      closes_on: k === 'freebie' || k === 'competition' ? closingDate(text, issueDate) : null, text,
    })
  }
  const flush = (link: string | null) => {
    if (!buf.length && !link) return
    const { headline, blurb } = headlineAndBlurb(buf)
    // The issue's lead photo: a caption on its own, no story and no link
    const photoOnly = !blurb && !link && /photograph|photo by|picture by/i.test(headline ?? '')
    push(photoOnly ? 'other' : null, headline, blurb, link, buf)
    buf = []
  }

  for (; i < paras.length; i++) {
    const p = paras[i]
    const plain = stripLinks(p)

    if (/^(Thank you so much|Support The Chiswick Calendar|If you have any comments or suggestions|Copyright ©)/i.test(plain)) {
      flush(null)
      section = 'footer'
      push('appeal', 'Support The Chiswick Calendar', null, null, paras.slice(i, i + 3))
      break
    }
    if (/^CLUB CARD$/.test(plain)) { flush(null); section = 'club_card'; continue }
    if (/^WHAT'?S ON$/i.test(plain) && plain === plain.toUpperCase()) { flush(null); section = 'whats_on'; continue }
    if (/^COLUMNISTS$/.test(plain)) { flush(null); section = 'columnists'; continue }

    if (/^More news stories/i.test(plain)) {
      flush(null)
      const prev: ItemSection = section
      section = 'more_news'
      for (i = i + 1; i < paras.length; i++) {
        const q = paras[i]
        if (/^Read all news stories/i.test(stripLinks(q))) break
        if (READ_MORE.test(q)) break // older issues close the list with "Read More"
        const m = q.match(LINKED)
        if (m && !BARE_URL.test(q)) push('more_news', stripLinks(m[1] + (m[3] ?? '')), null, m[2], [m[1]])
        else if (BARE_URL.test(q)) { i -= 1; break }
      }
      section = prev === 'top' ? 'features' : prev
      continue
    }

    if (BARE_URL.test(p)) {
      const url = p.replace(/^\(|\)$/g, '')
      if (!OWN_SITE.test(url)) { flush(null); push('banner', null, null, url, [url]) }
      continue // the Calendar's own bare links are section banners ("advertise with us", "news and features")
    }

    const rm = plain === '' ? null : p.match(READ_MORE)
    if (rm) { flush(rm[1] ?? null); continue }

    // Jazz at George IV block: a header paragraph then dated listings, closed by "See all our upcoming ... dates"
    if (/^See all our upcoming Jazz at George IV dates/i.test(plain)) {
      buf.push(p)
      const s: ItemSection = section
      section = 'jazz'
      flush(p.match(/\((https?:\/\/[^)]+)\)/)?.[1] ?? null)
      section = s
      continue
    }
    buf.push(p)
  }
  if (section !== 'footer') flush(null)
  return items
}

// What's On listing requests (Stage 20), worked out from the emails already in
// correspondence. No AI: plain text rules on raw_text_original.
//
// How a listing travels:
//   1. A "Chiswick Calendar – Promote my Event" form (Name / E-Mail / Event Title / When /
//      Where / Event details), or an ordinary email asking to be listed, reaches info@.
//   2. Tom forwards it to Cleo (cleopatracw4@gmail.com). Those forwards are rarely in the CRM,
//      but Cleo's reply quotes them ("On Mon, 26 Oct 2026 at 09:58, Chiswick Calendar Team wrote").
//   3. Cleo replies to info@, usually with the event's link on chiswickcalendar.co.uk/event/...
//   4. Sometimes Tom replies to the requester ("Listed these events for you here: ...").
// One request is one form (requester email + event title) or one email (its subject).

export const CLEO_EMAIL = 'cleopatracw4@gmail.com'
const OWN_DOMAINS = ['thechiswickcalendar.co.uk', 'chiswickcalendar.co.uk']
const EVENT_LINK = /https:\/\/chiswickcalendar\.co\.uk\/event\/([a-z0-9-]+)\/(?:(\d{4}-\d{2}-\d{2})\/)?/g

export type EntryRow = {
  id: string
  entry_date: string
  direction: string | null
  business_id: string | null
  raw_text_original: string | null
}

export type ParsedRequest = {
  request_key: string
  source: 'form' | 'email'
  title: string
  requester_name: string | null
  requester_email: string | null
  event_when: string | null
  entry_ids: string[]
  entry_business_ids: string[]
  asked_at: string | null
  sent_to_cleo_at: string | null
  cleo_replied_at: string | null
  cleo_note: string | null
  told_at: string | null
  event_links: string[]
}

export type EventLink = { url: string; slug: string; date: string | null }

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** A wall-clock time in London as an ISO instant (handles BST). */
export function londonToIso(y: number, m: number, d: number, hh = 12, mm = 0): string | null {
  if (!y || !m || !d) return null
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess - (shown - guess)).toISOString()
}

/** "29 October 2026 11:05", "Thu, 29 Oct 2026 at 11:15", "29/10/2026 11:05" → ISO, read as London time. */
export function parseLooseDate(s: string | null | undefined): string | null {
  if (!s) return null
  let m = s.match(/(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]{3})[a-z]*,? (\d{4})(?:,? (?:at )?(\d{1,2}):(\d{2}))?/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()]
    if (mon) return londonToIso(+m[3], mon, +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0)
  }
  m = s.match(/([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})(?:,? (?:at )?(\d{1,2}):(\d{2}))?/)
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()]
    if (mon) return londonToIso(+m[3], mon, +m[2], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0)
  }
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,? (\d{1,2}):(\d{2}))?/)
  if (m) return londonToIso(+m[3], +m[2], +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0)
  return null
}

const firstEmail = (s: string | null | undefined) => s?.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0].toLowerCase() ?? null
const isOwn = (email: string | null) => !!email && (OWN_DOMAINS.some((d) => email.endsWith('@' + d)) || email === CLEO_EMAIL)

export function cleanSubject(s: string): string {
  return s.replace(/^(\s*(fw|fwd|re)\s*:\s*)+/i, '').trim()
}

export function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/&amp;|&#038;/g, '&').replace(/&#8217;|’/g, "'").replace(/[^a-z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'at', 'in', 'on', 'of', 'a', 'an', 'to', 'our', 'your', 'event',
  'events', 'chiswick', 'calendar', 'listing', 'promote', 'my', 'is', 'by', 'w4', 'london', 'new', 'this', 'its', 'it', 'be',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])

export function titleWords(s: string): string[] {
  return [...new Set(normaliseTitle(s).replace(/'/g, '').split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+(st|nd|rd|th)?$/.test(w)))]
}

/** Share of the request title's words found in the event title (1 = all of them). */
export function titleScore(requestTitle: string, eventTitle: string): number {
  const a = titleWords(requestTitle)
  if (a.length === 0) return 0
  const b = new Set(titleWords(eventTitle))
  return a.filter((w) => b.has(w)).length / a.length
}

export function eventLinks(text: string): EventLink[] {
  const out: EventLink[] = []
  for (const m of text.matchAll(EVENT_LINK)) {
    if (!out.some((o) => o.url === m[0])) out.push({ url: m[0], slug: m[1], date: m[2] ?? null })
  }
  return out
}

type Header = { fromEmail: string | null; to: string | null; subject: string | null }
function header(raw: string): Header {
  const top = raw.slice(0, 1500)
  return {
    fromEmail: firstEmail(top.match(/^From: ([^\n]*)/)?.[1]),
    to: top.match(/\nTo: ([^\n]*)/)?.[1] ?? null,
    subject: top.match(/\nSubject: ([^\n]*)/)?.[1]?.trim() ?? null,
  }
}

/** Where the quoted chain starts: the first "On … wrote:" or forwarded "From:" block after the header. */
function quoteStart(raw: string, bodyStart: number): number {
  const rest = raw.slice(bodyStart)
  const hits = [
    rest.search(/\nOn [^\n]{6,160}?wrote:/),
    rest.search(/\nOn [A-Z][a-z]{2}, [^\n]*\n[^\n]*wrote:/),
    rest.search(/\n_{8,}\s*\nFrom: /),
    rest.search(/\n-{5,} ?Forwarded message/),
    rest.search(/\nFrom: [^\n]*\n(Sent|Date): /),
  ].filter((i) => i >= 0)
  return hits.length ? bodyStart + Math.min(...hits) : raw.length
}

function bodyStartOf(raw: string): number {
  const i = raw.search(/\n\n/)
  return i >= 0 ? i + 2 : 0
}

type Form = { name: string | null; email: string | null; title: string; when: string | null; at: number }
function findForm(raw: string): Form | null {
  const t = raw.match(/Event Title: ?([^\n]*)/)
  if (!t || t.index === undefined) return null
  const before = raw.slice(Math.max(0, t.index - 600), t.index)
  const name = [...before.matchAll(/Name: ?([^\n]*)/g)].pop()?.[1]?.trim() || null
  const email = firstEmail([...before.matchAll(/E-?Mail: ?([^\n]*)/gi)].pop()?.[1])
  const when = raw.slice(t.index).match(/When[^:\n]*: ?([^\n]*)/)?.[1]?.trim() || null
  // Some forms arrive on one line ("FIREWORKS. When: Saturday ..."): the title stops at "When".
  const title = t[1].split(/\s+When\b[^:]{0,30}:/)[0].replace(/[.\s]+$/, '').trim()
  if (!title) return null
  return { name, email, title, when, at: t.index }
}

/** The send time of the quoted message that holds position `pos` (its nearest "Sent:"/"Date:" line above). */
function quotedSentAt(raw: string, pos: number, after: number): string | null {
  const above = raw.slice(after, pos)
  const lines = [...above.matchAll(/\n(?:Sent|Date): ([^\n]*)/g)]
  return lines.length ? parseLooseDate(lines[lines.length - 1][1]) : null
}

/** When Tom's forward reached Cleo, from the chain her reply quotes. */
function sentToCleoAt(raw: string, from: number): string | null {
  const rest = raw.slice(from)
  const on = rest.match(/On ([^\n]{6,120}?)(?:,|\n)\s*(?:Chiswick Calendar|Tom|info@thechiswickcalendar)[^\n]*(?:\n[^\n]*)?wrote:/)
  if (on) return parseLooseDate(on[1])
  const outlook = rest.match(/From: [^\n]*(?:thechiswickcalendar|Chiswick Calendar)[^\n]*\n(?:Sent|Date): ([^\n]*)\n(?:To: [^\n]*cleopatracw4)/i)
  if (outlook) return parseLooseDate(outlook[1])
  return null
}

/** The original sender of a chain: the last quoted From: that isn't us or Cleo. */
function originalSender(raw: string): { name: string | null; email: string | null; sentAt: string | null } {
  const froms = [...raw.matchAll(/\nFrom: ([^\n]*)\n(?:(?:Sent|Date): ([^\n]*))?/g)]
  for (let i = froms.length - 1; i >= 0; i--) {
    const email = firstEmail(froms[i][1])
    if (email && !isOwn(email)) {
      const name = froms[i][1].replace(/<[^>]*>|\[[^\]]*\]|mailto:\S+/g, '').replace(/["']/g, '').trim() || null
      return { name: name && !name.includes('@') ? name : null, email, sentAt: parseLooseDate(froms[i][2]) }
    }
  }
  const gmail = [...raw.matchAll(/On ([^\n]{6,120}?),? ([^\n<]*)<([^>\s]+@[^>\s]+)>[^\n]*wrote:/g)].reverse()
    .find((g) => !isOwn(g[3].toLowerCase()))
  if (gmail) return { name: gmail[2].trim() || null, email: gmail[3].toLowerCase(), sentAt: parseLooseDate(gmail[1]) }
  return { name: null, email: null, sentAt: null }
}

const minIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b)

/**
 * The entries a sync reads: forms (Event Title:), and anything from, to or quoting Cleo.
 * Returns one request per form or per email subject.
 */
export function parseRequests(entries: EntryRow[]): ParsedRequest[] {
  const byKey = new Map<string, ParsedRequest>()
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))

  for (const e of sorted) {
    const raw = (e.raw_text_original ?? '').replace(/\r/g, '')
    if (!raw) continue
    const h = header(raw)
    const fromCleo = h.fromEmail === CLEO_EMAIL
    const fromUs = isOwn(h.fromEmail) && !fromCleo
    const toCleo = fromUs && (h.to ?? '').toLowerCase().includes(CLEO_EMAIL)
    const bodyStart = bodyStartOf(raw)
    const qStart = quoteStart(raw, bodyStart)
    const ownText = raw.slice(bodyStart, qStart)
    const form = findForm(raw)

    // An email from Cleo or to her that isn't about a listing (a rota, a question) has no form
    // and no event link; leave those out.
    if (!form && !(fromCleo && (eventLinks(raw).length > 0 || /list|what'?s on|event/i.test(h.subject ?? '')))) {
      if (!toCleo) continue
    }

    let key: string
    let req: ParsedRequest
    if (form) {
      const email = form.email ?? (fromUs || fromCleo ? null : h.fromEmail)
      key = `form:${email ?? '?'}|${normaliseTitle(form.title)}`
      req = byKey.get(key) ?? {
        request_key: key, source: 'form', title: form.title, requester_name: form.name, requester_email: email,
        event_when: form.when, entry_ids: [], entry_business_ids: [], asked_at: null, sent_to_cleo_at: null,
        cleo_replied_at: null, cleo_note: null, told_at: null, event_links: [],
      }
      // The form's own send time: the quoted Sent: line above it, or this entry if it is the form.
      const formSent = form.at > qStart ? quotedSentAt(raw, form.at, qStart) : null
      const isTheForm = !fromCleo && !fromUs && form.at < qStart
      req.asked_at = minIso(req.asked_at, formSent ?? (isTheForm || (!fromCleo && !toCleo && !fromUs) ? e.entry_date : null))
    } else {
      const subject = cleanSubject(h.subject ?? '')
      if (!subject) continue
      const orig = originalSender(raw)
      key = `email:${normaliseTitle(subject)}`
      req = byKey.get(key) ?? {
        request_key: key, source: 'email', title: subject, requester_name: orig.name, requester_email: orig.email,
        event_when: null, entry_ids: [], entry_business_ids: [], asked_at: null, sent_to_cleo_at: null,
        cleo_replied_at: null, cleo_note: null, told_at: null, event_links: [],
      }
      if (!req.requester_email && orig.email) { req.requester_email = orig.email; req.requester_name = orig.name }
      req.asked_at = minIso(req.asked_at, orig.sentAt)
    }

    if (!req.entry_ids.includes(e.id)) req.entry_ids.push(e.id)
    if (e.business_id && !req.entry_business_ids.includes(e.business_id)) req.entry_business_ids.push(e.business_id)

    const toCleoAt = fromCleo ? sentToCleoAt(raw, qStart) : null
    if (fromCleo && !toCleoAt && eventLinks(ownText).length === 0) {
      // Cleo passing on a request that was sent to her directly: it is with her, not answered.
      req.sent_to_cleo_at = minIso(req.sent_to_cleo_at, req.asked_at ?? e.entry_date)
    } else if (fromCleo) {
      req.cleo_replied_at = minIso(req.cleo_replied_at, e.entry_date)
      req.sent_to_cleo_at = minIso(req.sent_to_cleo_at, toCleoAt)
      const note = ownText.replace(/^[ \t]*_{5,}[ \t]*$/gm, '').replace(/\n{2,}/g, '\n').trim().slice(0, 600)
      // Keep Cleo's own words; a reply with a link beats an earlier one without.
      if (note && (!req.cleo_note || eventLinks(note).length > 0)) req.cleo_note = note
      for (const l of eventLinks(ownText)) if (!req.event_links.includes(l.url)) req.event_links.push(l.url)
    } else if (toCleo) {
      req.sent_to_cleo_at = minIso(req.sent_to_cleo_at, e.entry_date)
    } else if (fromUs && e.direction === 'sent') {
      const links = eventLinks(ownText)
      if (links.length) {
        req.told_at = minIso(req.told_at, e.entry_date)
        for (const l of links) if (!req.event_links.includes(l.url)) req.event_links.push(l.url)
      }
    }
    // Nothing earlier on file: the request was at least as old as the first step we saw.
    if (!req.asked_at) req.asked_at = minIso(req.sent_to_cleo_at, req.cleo_replied_at) ?? e.entry_date
    byKey.set(key, req)
  }
  return mergeRepeats([...byKey.values()])
}

/**
 * The same form sent twice (a corrected title, a second try): same requester, within 7 days, and
 * nearly the same title. Kept as one request under the first one's key.
 */
function mergeRepeats(reqs: ParsedRequest[]): ParsedRequest[] {
  const out: ParsedRequest[] = []
  const sorted = [...reqs].sort((a, b) => (a.asked_at ?? '').localeCompare(b.asked_at ?? ''))
  for (const r of sorted) {
    const twin = r.source === 'form' && r.requester_email ? out.find((o) =>
      o.source === 'form' && o.requester_email === r.requester_email &&
      Math.abs(new Date(r.asked_at ?? 0).getTime() - new Date(o.asked_at ?? 0).getTime()) < 7 * 86400000 &&
      Math.min(titleScore(o.title, r.title), titleScore(r.title, o.title)) >= 0.75) : undefined
    if (!twin) { out.push(r); continue }
    for (const id of r.entry_ids) if (!twin.entry_ids.includes(id)) twin.entry_ids.push(id)
    for (const id of r.entry_business_ids) if (!twin.entry_business_ids.includes(id)) twin.entry_business_ids.push(id)
    for (const l of r.event_links) if (!twin.event_links.includes(l)) twin.event_links.push(l)
    twin.sent_to_cleo_at = minIso(twin.sent_to_cleo_at, r.sent_to_cleo_at)
    twin.cleo_replied_at = minIso(twin.cleo_replied_at, r.cleo_replied_at)
    twin.told_at = minIso(twin.told_at, r.told_at)
    if (!twin.cleo_note || (r.cleo_note && eventLinks(r.cleo_note).length > 0 && eventLinks(twin.cleo_note).length === 0)) twin.cleo_note = r.cleo_note ?? twin.cleo_note
  }
  return out
}

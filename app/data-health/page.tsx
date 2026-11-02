import Link from 'next/link'
import { getDataHealth, type DataHealthRow } from '@/app/actions/data-health'
import { cn, formatDateGB } from '@/lib/utils'
import { FoldSection } from '@/components/ui/fold-section'
import { getQboToMatch } from '@/app/actions/qbo-match'
import { QboMatchList } from './_components/QboMatchList'
import { getSentMailToReview } from '@/app/actions/sent-mail-review'
import { SentMailList } from './_components/SentMailList'
import { bandClass } from '@/components/ui/kind'
import { getCompanyOverview, getCompanyMatches } from '@/app/actions/companies-house'
import { CompanyLookup, CompanyMatchList } from './_components/CompanyHousePanel'
import { getAdEmailMatches } from '@/app/actions/ad-emails'
import { AdEmailList } from './_components/AdEmailList'

export const maxDuration = 60

// Data health (UI overhaul Stage 11c, Decision 29 Oct): things that have drifted, each with a
// count and a list to fix, quiet when nothing has. Reached from Businesses and the user menu.
// Checks that are fixed on another tab are counted here and linked, not listed twice.

export const metadata = {
  title: 'Data health — Correspondence Clerk',
}

const HINTS: Record<string, string> = {
  club_card_no_card: 'The business still shows as a Club Card member, but its card has ended. Open the business and mark the old deal not current, or record the renewal.',
  deal_no_quickbooks: 'A deal in force or in its 60-day grace, with an amount and not marked paid, but no QuickBooks customer linked, so money owed can’t be seen. Link the customer on the business page, or mark the deal paid.',
  active_no_named_contact: 'An Active member or advertiser with no named, active contact. Add the person on the business page.',
  qbo_customer_to_match: 'QuickBooks customers (all of them since Nov 2019) that have invoices but no business in the app, so their invoices can’t be seen on a business page. Tick any, then Confirm the suggested business, Choose a business, or Make a new business. The suggestion is a guess from the name, email address or domain: check it. Undo takes back the last change.',
  sent_mail_to_review: 'Sent email from tom@ or info@ to an address that matches no contact or business in the app (personal Gmail-type addresses are skipped). Tick any, then Choose a business to file the emails there (the person is added as a contact if Outlook gave a name, and the company domain is remembered) or Ignore them. Undo takes back the last change.',
  company_to_match: 'A Companies House company that looks like this business but was not certain enough to attach on its own (a similar name, a registered office outside W3, W4 and W5, or more than one company with the name). Open the register link, then tick and Confirm, or say it is not this company. Confirming reads its status, officers and filing dates into the business dossier.',
  company_not_trading: 'The register says this company is dissolved, in liquidation or similar, but the business is still Active or has a current deal. Check before chasing money or renewing. Clears when the business or deal is updated.',
  void_invoice_contract: 'A current Club Card or advertising contract, not marked paid, whose invoice is void in QuickBooks. If it was their membership, open the business and end the contract (Club Card tab: End membership); if not, the contract can stay. Clears when the contract ends or is paid.',
  stored_out_of_step: 'The status or last-in-touch date stored on the business differs from the one worked out from its deals and emails. Hidden records are left out.',
}

const DEAL_WORDS: Record<string, string> = { club_card: 'Club Card', advertiser: 'Advertising' }
const dateGB = (d: string | null) => (d ? formatDateGB(`${d.slice(0, 10)}T12:00:00Z`) : '')

function what(r: DataHealthRow): string {
  switch (r.check_key) {
    case 'club_card_no_card':
      return r.ref_date ? `Card ended ${dateGB(r.ref_date)}; the deal is still marked current` : 'No Club Card deal dates on file'
    case 'deal_no_quickbooks':
      return `${DEAL_WORDS[r.detail ?? ''] ?? r.detail ?? 'Deal'}, ${r.ref_date ? `ends ${dateGB(r.ref_date)}` : 'no end date'}`
    case 'active_no_named_contact':
      return r.detail === 'grace' ? 'In grace, no named contact' : 'No named contact'
    case 'stored_out_of_step':
      return [
        r.detail?.includes('status') ? 'Stored status differs' : null,
        r.detail?.includes('last_in_touch') ? `Stored last in touch ${r.ref_date ? dateGB(r.ref_date) : 'empty'}, which the emails on file don’t match` : null,
      ].filter(Boolean).join('; ')
    default:
      return r.detail ?? ''
  }
}

const card = 'bg-white border border-black/[0.06] rounded-sm shadow-[var(--shadow-sm)]'

export default async function DataHealthPage() {
  const result = await getDataHealth()

  const header = (
    <div className="mb-5">
      <p className="text-sm text-gray-600">
        <Link href="/businesses" className="font-semibold text-brand-navy hover:underline">Businesses</Link> ›
      </p>
      <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-serif)', color: 'var(--brand-dark)' }}>Data health</h1>
      <p className="text-sm text-gray-600">Things that have drifted, checked live. Each one clears by itself once it is fixed.</p>
      <p className="text-sm text-gray-600 mt-1">
        Emails the team forwarded in that are still filed under them:{' '}
        <Link href="/review/team-forwards" className="underline" style={{ color: 'var(--link-blue)' }}>Team forwards</Link>.
      </p>
    </div>
  )

  if (result.error || !result.data) {
    return (
      <div className="mx-auto px-4 py-8 max-w-[1100px]">
        {header}
        <p className="text-sm text-red-700">Could not load Data health: {result.error ?? 'no data'}</p>
      </div>
    )
  }

  const { checks, rows } = result.data
  const here = checks.filter((c) => c.fixed_on === '/data-health')
  const elsewhere = checks.filter((c) => c.fixed_on !== '/data-health' && c.n > 0)
  const todo = here.filter((c) => c.n > 0)
  const qbo = todo.some((c) => c.check_key === 'qbo_customer_to_match') ? await getQboToMatch() : null
  const sent = todo.some((c) => c.check_key === 'sent_mail_to_review') ? await getSentMailToReview() : null
  const company = todo.some((c) => c.check_key === 'company_to_match') ? await getCompanyMatches() : null
  const companyOverview = await getCompanyOverview()
  const adEmails = await getAdEmailMatches()
  const fine = here.filter((c) => c.n === 0)

  return (
    <div className="mx-auto px-4 py-6 max-w-[1100px] space-y-2">
      {header}

      {todo.length === 0 ? (
        <p className={cn(card, 'px-4 py-3 text-sm text-gray-700')}>Nothing to fix. Every check here is clear.</p>
      ) : (
        <p className="text-sm text-gray-700">
          <b>{todo.length} {todo.length === 1 ? 'check needs' : 'checks need'} you</b>
          {fine.length > 0 && <>; {fine.length} clear ({fine.map((c) => c.title).join(', ')})</>}.
        </p>
      )}

      <section aria-labelledby="dh-ch-h" className={card}>
        <h2 id="dh-ch-h" className="px-3 pt-2 text-base font-semibold">Companies House</h2>
        <p className="px-3 text-xs text-gray-600">
          Company number, status, officers, registered office and filing dates for Active, Former and Unreviewed businesses, read from the free register and refreshed weekly. Exact name matches with a W3, W4 or W5 registered office attach themselves; the rest are listed below to confirm.
        </p>
        {companyOverview.data
          ? <CompanyLookup overview={companyOverview.data} />
          : <p className="px-3 py-2 text-sm text-red-700">Could not load: {companyOverview.error}</p>}
      </section>

      {adEmails.data && adEmails.data.length > 0 && (
        <section className={card}>
          <FoldSection
            storageKey="datahealth.ad_email_to_match"
            title="Ad emails to match to an advertiser"
            badge={<span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-sm tabular-nums bg-ms-orange text-ms-orange-text">{adEmails.data.length}</span>}
            hint="Emails from Dawn Wilson or James Willcocks about an ad that might be about this advertiser. Confirm and the email also shows on that business (it stays on their own record too, and Claude finds it when asked about that advertiser). Undo takes back the last change."
            heading="h2"
          >
            <AdEmailList rows={adEmails.data} />
          </FoldSection>
        </section>
      )}

      {todo.length > 0 && (
      <section aria-labelledby="dh-fix-h" className={card}>
        <h2 id="dh-fix-h" className={cn(bandClass('attention'), 'px-3 py-1.5 rounded-t-sm text-[1.35rem] leading-tight font-semibold')} style={{ fontFamily: 'var(--font-serif)' }}>
          To fix <span className="text-sm font-normal tabular-nums" style={{ fontFamily: 'var(--font-sans)' }}>{todo.length}</span>
        </h2>
      {todo.map((c) => {
        const list = rows.filter((r) => r.check_key === c.check_key)
        if (c.check_key === 'qbo_customer_to_match') {
          return (
            <FoldSection
              key={c.check_key}
              storageKey={`datahealth.${c.check_key}`}
              title={c.title}
              badge={<span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-sm tabular-nums bg-ms-orange text-ms-orange-text">{c.n}</span>}
              hint={HINTS[c.check_key]}
              heading="h3"
            >
              {qbo?.data
                ? <QboMatchList rows={qbo.data.rows} businesses={qbo.data.businesses} />
                : <p className="px-3 py-2 text-sm text-red-700">Could not load the list: {qbo?.error ?? 'no data'}</p>}
            </FoldSection>
          )
        }
        if (c.check_key === 'company_to_match') {
          return (
            <FoldSection
              key={c.check_key}
              storageKey={`datahealth.${c.check_key}`}
              title={c.title}
              badge={<span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-sm tabular-nums bg-ms-orange text-ms-orange-text">{c.n}</span>}
              hint={HINTS[c.check_key]}
              heading="h3"
            >
              {company?.data
                ? <CompanyMatchList rows={company.data} />
                : <p className="px-3 py-2 text-sm text-red-700">Could not load the list: {company?.error ?? 'no data'}</p>}
            </FoldSection>
          )
        }
        if (c.check_key === 'sent_mail_to_review') {
          return (
            <FoldSection
              key={c.check_key}
              storageKey={`datahealth.${c.check_key}`}
              title={c.title}
              badge={<span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-sm tabular-nums bg-ms-orange text-ms-orange-text">{c.n}</span>}
              hint={HINTS[c.check_key]}
              heading="h3"
            >
              {sent?.data
                ? <SentMailList rows={sent.data.rows} businesses={sent.data.businesses} />
                : <p className="px-3 py-2 text-sm text-red-700">Could not load the list: {sent?.error ?? 'no data'}</p>}
            </FoldSection>
          )
        }
        return (
          <FoldSection
            key={c.check_key}
            storageKey={`datahealth.${c.check_key}`}
            title={c.title}
            badge={<span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-sm tabular-nums bg-ms-orange text-ms-orange-text">{c.n}</span>}
            hint={HINTS[c.check_key]}
            heading="h3"
          >
            <div className="overflow-x-auto mt-1.5 border-t border-black/[0.06]">
              <table className="w-full text-sm border-collapse">
                <caption className="sr-only">{c.title}</caption>
                <thead>
                  <tr className="bg-brand-warm text-left">
                    <th scope="col" className="px-3 py-1.5 font-semibold">Business</th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">What is wrong</th>
                    <th scope="col" className="px-3 py-1.5 font-semibold"><span className="sr-only">Fix</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={`${r.business_id}:${r.contract_id ?? ''}`} className="border-t border-black/[0.06] align-top">
                      <th scope="row" className="px-3 py-1.5 text-left font-semibold">
                        <Link href={`/businesses/${r.business_id}`} className="text-brand-dark hover:underline">{r.business_name}</Link>
                      </th>
                      <td className="px-3 py-1.5 text-gray-700">{what(r)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <Link href={`/businesses/${r.business_id}`} className="font-semibold text-brand-navy hover:underline">
                          Open the business<span className="sr-only"> {r.business_name}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FoldSection>
        )
      })}
      </section>
      )}

      {elsewhere.length > 0 && (
        <section aria-labelledby="dh-else-h" className={card}>
          <h2 id="dh-else-h" className={cn(bandClass('neutral'), 'px-3 py-1.5 rounded-t-sm text-[1.35rem] leading-tight font-semibold')} style={{ fontFamily: 'var(--font-serif)' }}>Fixed on their own tabs</h2>
          <p className="text-sm text-gray-700 px-3 py-2.5">
            Counted here, listed where you fix them:{' '}
            {elsewhere.map((c, i) => (
              <span key={c.check_key}>
                {i > 0 && ' · '}
                <Link href={c.fixed_on} className="font-semibold text-brand-navy hover:underline">{c.n} {c.title}</Link>
              </span>
            ))}
          </p>
        </section>
      )}
    </div>
  )
}

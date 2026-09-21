import type { OneOffSale } from '@/app/actions/contracts'

function formatDateGB(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const money = (n: number) =>
  '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/**
 * Work bought outside a membership: advertorials, featured articles, short ad
 * runs, band fee contributions. Taken straight from QuickBooks every morning,
 * so it needs no keeping up to date.
 */
export function BusinessOneOffs({ sales }: { sales: OneOffSale[] }) {
  if (sales.length === 0) return null

  const total = sales.reduce((sum, s) => sum + Number(s.amount), 0)
  const owed = sales.filter(s => !s.is_paid).reduce((sum, s) => sum + Number(s.amount), 0)

  return (
    <div className="mb-6 border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-brand-dark">Other work bought</h2>
        <p className="text-xs text-gray-500">
          {money(total)} across {sales.length} {sales.length === 1 ? 'invoice' : 'invoices'}
          {owed > 0 && <span className="text-red-700"> · {money(owed)} outstanding</span>}
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {sales.map(s => (
          <li key={s.id} className="py-2 text-sm flex items-start gap-3">
            <span className="text-gray-400 text-xs whitespace-nowrap w-24 flex-shrink-0">{formatDateGB(s.sold_on)}</span>
            <span className="flex-1 min-w-0 text-gray-700">
              {s.description ?? 'Invoice'}
              {s.doc_number && <span className="text-gray-400"> · invoice {s.doc_number}</span>}
            </span>
            <span className={`flex-shrink-0 text-xs font-medium ${s.is_paid ? 'text-gray-500' : 'text-red-700'}`}>
              {money(s.amount)}{s.is_paid ? '' : ' unpaid'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

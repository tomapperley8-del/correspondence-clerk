'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ContractStatusBadge } from '@/components/ContractStatusBadge'
import { getContractsByBusiness, createContract, updateContract, deleteContract, type Contract } from '@/app/actions/contracts'
import type { Business } from '@/app/actions/businesses'
import type { MembershipType } from '@/app/actions/membership-types'

interface ContractDetailsCardProps {
  business: Business
  onUpdate: () => void
  membershipTypes?: MembershipType[]
}

const LEGACY_COLOURS: Record<string, string> = {
  club_card: 'bg-blue-100 text-blue-800',
  advertiser: 'bg-green-100 text-green-800',
  former_club_card: 'bg-gray-100 text-gray-700',
  former_advertiser: 'bg-gray-100 text-gray-700',
}

const DEFAULT_COLOURS = [
  'bg-blue-100 text-blue-800',
  'bg-green-100 text-green-800',
  'bg-gray-100 text-gray-700',
  'bg-yellow-100 text-yellow-800',
  'bg-purple-100 text-purple-800',
  'bg-pink-100 text-pink-800',
]

function getMembershipColour(value: string, types: MembershipType[]): string {
  if (LEGACY_COLOURS[value]) return LEGACY_COLOURS[value]
  const idx = types.findIndex((t) => t.value === value)
  return DEFAULT_COLOURS[idx >= 0 ? idx % DEFAULT_COLOURS.length : 0]
}

const emptyForm = {
  membership_type: '',
  contract_start: '',
  contract_end: '',
  contract_amount: '',
  contract_currency: 'GBP',
  billing_frequency: 'annual' as 'monthly' | 'annual',
  deal_terms: '',
  invoice_paid: false,
  is_current: true,
}

function ContractForm({
  initial,
  onSave,
  onCancel,
  saveLabel = 'Save',
  membershipTypes = [],
}: {
  initial: typeof emptyForm
  onSave: (data: typeof emptyForm) => Promise<void>
  onCancel: () => void
  saveLabel?: string
  membershipTypes?: MembershipType[]
}) {
  const [data, setData] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-brand-navy/20 bg-brand-navy/[0.03] p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <Label htmlFor="contractStart" className="block text-sm font-semibold mb-1">Start Date</Label>
          <Input id="contractStart" type="date" value={data.contract_start}
            onChange={(e) => setData({ ...data, contract_start: e.target.value })} className="w-full" />
        </div>
        <div>
          <Label htmlFor="contractEnd" className="block text-sm font-semibold mb-1">End Date</Label>
          <Input id="contractEnd" type="date" value={data.contract_end}
            onChange={(e) => setData({ ...data, contract_end: e.target.value })} className="w-full" />
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="contractAmount" className="block text-sm font-semibold mb-1">Amount (£ GBP)</Label>
        <div className="flex gap-2">
          <span className="flex items-center px-3 py-2 bg-gray-100 border border-gray-200 font-bold">£</span>
          <Input id="contractAmount" type="number" step="0.01" min="0" value={data.contract_amount}
            onChange={(e) => setData({ ...data, contract_amount: e.target.value })}
            placeholder="0.00" className="flex-1" />
        </div>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => setData({ ...data, billing_frequency: 'monthly' })}
            className={`px-3 py-1 text-sm font-semibold border transition-colors ${data.billing_frequency === 'monthly' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-700 border-gray-200 hover:border-brand-navy'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setData({ ...data, billing_frequency: 'annual' })}
            className={`px-3 py-1 text-sm font-semibold border transition-colors ${data.billing_frequency === 'annual' ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-700 border-gray-200 hover:border-brand-navy'}`}
          >
            Annual
          </button>
        </div>
      </div>

      <div className="mb-4">
        <Label htmlFor="membershipType" className="block text-sm font-semibold mb-1">Membership Type</Label>
        <select id="membershipType" value={data.membership_type}
          onChange={(e) => setData({ ...data, membership_type: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 bg-white focus:border-brand-navy focus:outline-none">
          <option value="">None</option>
          {membershipTypes.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <Label htmlFor="dealTerms" className="block text-sm font-semibold mb-1">Deal Terms / Notes</Label>
        <textarea id="dealTerms" value={data.deal_terms}
          onChange={(e) => setData({ ...data, deal_terms: e.target.value })}
          placeholder="Enter contract terms, renewal conditions, special notes..."
          className="w-full min-h-[80px] px-3 py-2 border border-gray-200 focus:border-brand-navy focus:outline-none" />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={data.invoice_paid}
            onChange={(e) => setData({ ...data, invoice_paid: e.target.checked })}
            className="w-4 h-4" />
          <span className="text-sm font-semibold">Invoice paid</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={data.is_current}
            onChange={(e) => setData({ ...data, is_current: e.target.checked })}
            className="w-4 h-4" />
          <span className="text-sm font-semibold">Current contract</span>
        </label>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-300 p-2">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}
          className="bg-brand-navy text-white hover:bg-brand-navy-hover px-4 py-2 font-semibold">
          {saving ? 'Saving...' : saveLabel}
        </Button>
        <Button type="button" onClick={onCancel} disabled={saving}
          className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2">
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function ContractDetailsCard({ business, onUpdate, membershipTypes = [] }: ContractDetailsCardProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const loadContracts = async () => {
    const result = await getContractsByBusiness(business.id)
    if ('data' in result) setContracts(result.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadContracts() }, [business.id])

  const formatAmount = (amount: number | null, currency = 'GBP') => {
    if (!amount) return null
    const symbol = currency === 'GBP' ? '£' : currency
    return `${symbol}${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB') : null

  const contractToForm = (c: Contract): typeof emptyForm => ({
    membership_type: c.membership_type || '',
    contract_start: c.contract_start || '',
    contract_end: c.contract_end || '',
    contract_amount: c.contract_amount?.toString() || '',
    contract_currency: c.contract_currency || 'GBP',
    billing_frequency: c.billing_frequency || 'annual',
    deal_terms: c.deal_terms || '',
    invoice_paid: c.invoice_paid,
    is_current: c.is_current,
  })

  const handleAdd = async (data: typeof emptyForm) => {
    const result = await createContract(business.id, {
      membership_type: data.membership_type || null,
      contract_start: data.contract_start || null,
      contract_end: data.contract_end || null,
      contract_amount: data.contract_amount ? parseFloat(data.contract_amount) : null,
      contract_currency: data.contract_currency,
      billing_frequency: data.billing_frequency,
      deal_terms: data.deal_terms || null,
      invoice_paid: data.invoice_paid,
      is_current: data.is_current,
    })
    if ('error' in result) throw new Error(result.error)
    setShowAddForm(false)
    await loadContracts()
    onUpdate()
  }

  const handleEdit = async (contractId: string, data: typeof emptyForm) => {
    const result = await updateContract(contractId, business.id, {
      membership_type: data.membership_type || null,
      contract_start: data.contract_start || null,
      contract_end: data.contract_end || null,
      contract_amount: data.contract_amount ? parseFloat(data.contract_amount) : null,
      contract_currency: data.contract_currency,
      billing_frequency: data.billing_frequency,
      deal_terms: data.deal_terms || null,
      invoice_paid: data.invoice_paid,
      is_current: data.is_current,
    })
    if ('error' in result) throw new Error(result.error)
    setEditingId(null)
    await loadContracts()
    onUpdate()
  }

  const handleDelete = async (contractId: string) => {
    setDeletingId(contractId)
    await deleteContract(contractId, business.id)
    await loadContracts()
    setDeletingId(null)
    onUpdate()
  }

  const handleInvoiceToggle = async (contract: Contract) => {
    await updateContract(contract.id, business.id, { invoice_paid: !contract.invoice_paid })
    await loadContracts()
    onUpdate()
  }

  const currentContracts = contracts.filter((c) => c.is_current)
  const historicContracts = contracts.filter((c) => !c.is_current)

  const renderContract = (contract: Contract) => {
    if (editingId === contract.id) {
      return (
        <div key={contract.id} className="mb-3">
          <ContractForm
            initial={contractToForm(contract)}
            onSave={(data) => handleEdit(contract.id, data)}
            onCancel={() => setEditingId(null)}
            saveLabel="Save Changes"
            membershipTypes={membershipTypes}
          />
        </div>
      )
    }

    return (
      <div key={contract.id} className="border border-gray-200 bg-white p-4 mb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {contract.membership_type && (
                <span className={`text-xs px-2 py-0.5 font-semibold ${getMembershipColour(contract.membership_type, membershipTypes)}`}>
                  {membershipTypes.find((t) => t.value === contract.membership_type)?.label || contract.membership_type}
                </span>
              )}
              {!contract.is_current && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 font-semibold">Historic</span>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={contract.invoice_paid}
                  onChange={() => handleInvoiceToggle(contract)}
                  className="w-4 h-4"
                />
                <span className={`text-xs font-semibold ${contract.invoice_paid ? 'text-green-700' : 'text-gray-500'}`}>
                  Invoice paid
                </span>
              </label>
            </div>

            {(contract.contract_start || contract.contract_end) && (
              <div className="mb-1">
                {contract.contract_start && contract.contract_end ? (
                  <ContractStatusBadge startDate={contract.contract_start} endDate={contract.contract_end} isCurrent={contract.is_current} />
                ) : (
                  <span className="text-sm text-gray-700">
                    {contract.contract_start ? `From ${formatDate(contract.contract_start)}` : `Until ${formatDate(contract.contract_end)}`}
                  </span>
                )}
              </div>
            )}

            {contract.contract_amount && (
              <p className="text-xl font-bold text-gray-900 mb-1">
                {formatAmount(contract.contract_amount, contract.contract_currency || 'GBP')}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {contract.billing_frequency === 'monthly' ? 'per month' : 'per year'}
                </span>
              </p>
            )}

            {contract.deal_terms && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{contract.deal_terms}</p>
            )}
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            <Button type="button" onClick={() => setEditingId(contract.id)}
              className="bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20 px-3 py-1 text-xs font-semibold">
              Edit
            </Button>
            <Button type="button" onClick={() => handleDelete(contract.id)}
              disabled={deletingId === contract.id}
              className="bg-red-100 text-red-900 hover:bg-red-200 px-3 py-1 text-xs font-semibold">
              {deletingId === contract.id ? '...' : 'Delete'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-gray-900">Contract Details</h3>
        <Button type="button" onClick={() => { setShowAddForm(true); setEditingId(null) }}
          className="bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20 px-4 py-2 text-sm font-semibold">
          Add Contract
        </Button>
      </div>

      {showAddForm && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">New Contract</p>
          <ContractForm
            initial={emptyForm}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
            saveLabel="Add Contract"
            membershipTypes={membershipTypes}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : contracts.length === 0 && !showAddForm ? (
        <p className="text-gray-600 text-sm">
          No contracts recorded. Click &quot;Add Contract&quot; to add membership type, dates, and amounts.
        </p>
      ) : (
        <>
          {currentContracts.map(renderContract)}

          {historicContracts.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                {showHistory ? '▾ Hide history' : `▸ Show history (${historicContracts.length})`}
              </button>
              {showHistory && (
                <div className="mt-2">
                  {historicContracts.map(renderContract)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

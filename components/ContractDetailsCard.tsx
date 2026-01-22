'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ContractTimeline } from '@/components/ContractTimeline'
import type { Business } from '@/app/actions/businesses'

interface ContractDetailsCardProps {
  business: Business
  onUpdate: () => void
}

export function ContractDetailsCard({ business, onUpdate }: ContractDetailsCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editedData, setEditedData] = useState({
    contract_start: business.contract_start || '',
    contract_end: business.contract_end || '',
    contract_amount: business.contract_amount?.toString() || '',
    contract_currency: business.contract_currency || 'GBP',
    deal_terms: business.deal_terms || '',
  })

  const handleStartEdit = () => {
    setEditedData({
      contract_start: business.contract_start || '',
      contract_end: business.contract_end || '',
      contract_amount: business.contract_amount?.toString() || '',
      contract_currency: business.contract_currency || 'GBP',
      deal_terms: business.deal_terms || '',
    })
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    setIsSaving(true)

    try {
      const response = await fetch('/api/businesses/update-contract', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          contract_start: editedData.contract_start || null,
          contract_end: editedData.contract_end || null,
          contract_amount: editedData.contract_amount ? parseFloat(editedData.contract_amount) : null,
          contract_currency: editedData.contract_currency,
          deal_terms: editedData.deal_terms || null,
        }),
      })

      if (response.ok) {
        setIsEditing(false)
        onUpdate()
      } else {
        alert('Failed to update contract details')
      }
    } catch (error) {
      console.error('Error updating contract:', error)
      alert('Error updating contract details')
    } finally {
      setIsSaving(false)
    }
  }

  const hasContractData = business.contract_start || business.contract_end || business.contract_amount || business.deal_terms

  // Format currency amount
  const formatAmount = (amount: number | null, currency: string = 'GBP') => {
    if (!amount) return null
    const symbol = currency === 'GBP' ? '£' : currency
    return `${symbol}${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  if (isEditing) {
    return (
      <div className="bg-blue-50 border-2 border-blue-600 p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Contract Details</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Contract Start */}
          <div>
            <Label htmlFor="contractStart" className="block text-sm font-semibold mb-1">
              Contract Start Date
            </Label>
            <Input
              id="contractStart"
              type="date"
              value={editedData.contract_start}
              onChange={(e) => setEditedData({ ...editedData, contract_start: e.target.value })}
              className="w-full"
            />
          </div>

          {/* Contract End */}
          <div>
            <Label htmlFor="contractEnd" className="block text-sm font-semibold mb-1">
              Contract End Date
            </Label>
            <Input
              id="contractEnd"
              type="date"
              value={editedData.contract_end}
              onChange={(e) => setEditedData({ ...editedData, contract_end: e.target.value })}
              className="w-full"
            />
          </div>
        </div>

        {/* Contract Amount */}
        <div className="mb-4">
          <Label htmlFor="contractAmount" className="block text-sm font-semibold mb-1">
            Contract Amount (£ GBP)
          </Label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 py-2 bg-gray-100 border-2 border-gray-300 font-bold">
              £
            </span>
            <Input
              id="contractAmount"
              type="number"
              step="0.01"
              min="0"
              value={editedData.contract_amount}
              onChange={(e) => setEditedData({ ...editedData, contract_amount: e.target.value })}
              placeholder="0.00"
              className="flex-1"
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">Enter amount without currency symbol</p>
        </div>

        {/* Deal Terms */}
        <div className="mb-4">
          <Label htmlFor="dealTerms" className="block text-sm font-semibold mb-1">
            Deal Terms / Notes
          </Label>
          <textarea
            id="dealTerms"
            value={editedData.deal_terms}
            onChange={(e) => setEditedData({ ...editedData, deal_terms: e.target.value })}
            placeholder="Enter contract terms, renewal conditions, special notes..."
            className="w-full min-h-[100px] px-3 py-2 border-2 border-gray-300 focus:border-blue-600 focus:outline-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleSaveEdit}
            disabled={isSaving}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 font-semibold"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            type="button"
            onClick={handleCancelEdit}
            disabled={isSaving}
            className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2"
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border-2 border-gray-300 p-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-gray-900">Contract Details</h3>
        <Button
          type="button"
          onClick={handleStartEdit}
          className="bg-blue-100 text-blue-900 hover:bg-blue-200 px-4 py-2 text-sm font-semibold"
        >
          Edit Contract Details
        </Button>
      </div>

      {!hasContractData ? (
        <p className="text-gray-600 text-sm">
          No contract information recorded. Click "Edit Contract Details" to add dates, amounts, and terms.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Contract Timeline */}
          {business.contract_start && business.contract_end && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Contract Period:</h4>
              <ContractTimeline
                startDate={business.contract_start}
                endDate={business.contract_end}
              />
            </div>
          )}

          {/* Contract Amount */}
          {business.contract_amount && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700">Contract Value:</h4>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatAmount(business.contract_amount, business.contract_currency || 'GBP')}
              </p>
            </div>
          )}

          {/* Deal Terms */}
          {business.deal_terms && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Deal Terms:</h4>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{business.deal_terms}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, memo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Business } from '@/app/actions/businesses'

interface BusinessSelectorProps {
  businesses: Business[]
  selectedBusinessId: string | null
  onSelect: (businessId: string) => void
  onAddNew: () => void
  error?: string
}

function BusinessSelectorComponent({
  businesses,
  selectedBusinessId,
  onSelect,
  onAddNew,
  error,
}: BusinessSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId)

  const filteredBusinesses = businesses.filter((business) =>
    business.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (businessId: string) => {
    onSelect(businessId)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div>
      <Label className="block mb-2 font-semibold">
        Business <span className="text-red-600">*</span>
      </Label>

      {!selectedBusiness ? (
        <div className="relative">
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search for a business..."
            className={`w-full ${error ? 'border-red-600' : ''}`}
          />

          {isOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-800 max-h-60 overflow-y-auto">
              {filteredBusinesses.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-gray-600 text-sm mb-3">
                    No businesses found
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      onAddNew()
                    }}
                    className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2"
                  >
                    Add New Business
                  </Button>
                </div>
              ) : (
                <>
                  {filteredBusinesses.map((business) => (
                    <button
                      key={business.id}
                      type="button"
                      onClick={() => handleSelect(business.id)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-300 last:border-b-0"
                    >
                      <div className="font-semibold">{business.name}</div>
                      {business.category && (
                        <div className="text-xs text-gray-600 mt-1">
                          {business.category}
                        </div>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      onAddNew()
                    }}
                    className="w-full text-left px-4 py-3 bg-gray-100 hover:bg-gray-200 text-blue-600 font-semibold"
                  >
                    + Add New Business
                  </button>
                </>
              )}
            </div>
          )}

          {isOpen && (
            <div
              className="fixed inset-0 z-0"
              onClick={() => setIsOpen(false)}
            />
          )}
        </div>
      ) : (
        <div className="border-2 border-green-600 bg-green-50 px-4 py-3 flex justify-between items-center">
          <div>
            <div className="font-semibold text-gray-900">
              {selectedBusiness.name}
            </div>
            {selectedBusiness.category && (
              <div className="text-xs text-gray-600 mt-1">
                {selectedBusiness.category}
              </div>
            )}
          </div>
          <Button
            type="button"
            onClick={() => onSelect('')}
            className="bg-gray-200 text-gray-900 hover:bg-gray-300 px-4 py-2"
          >
            Change
          </Button>
        </div>
      )}

      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  )
}

// Memoize to prevent unnecessary re-renders during email import
export const BusinessSelector = memo(BusinessSelectorComponent)

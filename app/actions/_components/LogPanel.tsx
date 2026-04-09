'use client'

import { useState, useEffect, useRef } from 'react'
import { createCorrespondence } from '@/app/actions/correspondence'

type LogPanelProps = {
  businessId: string
  contactId: string | null
  showMarkDone: boolean
  onSave: (markDone: boolean) => void
  onCancel: () => void
}

export function LogPanel({ businessId, contactId, showMarkDone, onSave, onCancel }: LogPanelProps) {
  const [text, setText] = useState('')
  const [logType, setLogType] = useState<'Note' | 'Call' | 'Email'>('Note')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0])
  const [logTime, setLogTime] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [markDone, setMarkDone] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    let entryDate: string
    try {
      entryDate = logTime
        ? new Date(`${logDate}T${logTime}`).toISOString()
        : new Date(`${logDate}T12:00:00`).toISOString()
    } catch {
      entryDate = new Date().toISOString()
    }
    const result = await createCorrespondence({
      business_id: businessId,
      contact_id: contactId || undefined,
      raw_text_original: text.trim(),
      direction: 'sent',
      type: logType,
      entry_date: entryDate,
    })
    if ('error' in result && result.error) {
      setError(result.error)
      setSaving(false)
    } else {
      onSave(markDone)
    }
  }

  const placeholder = logType === 'Call' ? 'What was discussed…' : logType === 'Email' ? 'What did you send…' : 'Add a note…'

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        <select
          value={logType}
          onChange={e => setLogType(e.target.value as 'Note' | 'Call' | 'Email')}
          className="text-xs border border-gray-300 px-2 py-1.5 bg-white focus:outline-none focus:border-brand-navy"
        >
          <option value="Note">Note</option>
          <option value="Call">Call</option>
          <option value="Email">Email</option>
        </select>
        <input
          type="date"
          value={logDate}
          onChange={e => setLogDate(e.target.value)}
          className="text-xs border border-gray-300 px-2 py-1.5 bg-white focus:outline-none focus:border-brand-navy"
        />
        <input
          type="time"
          value={logTime}
          onChange={e => setLogTime(e.target.value)}
          className="text-xs border border-gray-300 px-2 py-1.5 bg-white focus:outline-none focus:border-brand-navy w-24"
        />
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full text-sm border border-gray-300 px-3 py-2 resize-none focus:outline-none focus:border-brand-navy"
      />
      {error && <p className="text-red-700 text-xs mt-1">{error}</p>}
      <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
        {showMarkDone ? (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={markDone}
              onChange={e => setMarkDone(e.target.checked)}
              className="accent-brand-navy"
            />
            Mark original as done
          </label>
        ) : <span />}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="px-3 py-1 text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navy-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

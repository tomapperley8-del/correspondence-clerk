'use client'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { INTERNAL_SENDER_NAMES } from '@/lib/internal-senders'

type EntryType = 'Email' | 'Call' | 'Meeting' | 'Email Thread' | 'Note' | ''
type Direction = 'received' | 'sent' | ''

type Props = {
  entryDateOnly: string
  entryTime: string
  entryType: EntryType
  direction: Direction
  internalSender: string
  threadParticipants: string
  errors: { entryDate?: string; direction?: string }
  onDateChange: (v: string) => void
  onTimeChange: (v: string) => void
  onKindChange: (type: EntryType, dir: Direction) => void
  onInternalSenderChange: (v: string) => void
  onThreadParticipantsChange: (v: string) => void
}

const KIND_MAP: Record<string, { type: EntryType; dir: Direction }> = {
  email_received:  { type: 'Email',        dir: 'received' },
  email_sent:      { type: 'Email',        dir: 'sent' },
  thread_received: { type: 'Email Thread', dir: 'received' },
  thread_sent:     { type: 'Email Thread', dir: 'sent' },
  call_received:   { type: 'Call',         dir: 'received' },
  call_made:       { type: 'Call',         dir: 'sent' },
  meeting:         { type: 'Meeting',      dir: '' },
  note:            { type: 'Note',         dir: '' },
}

function kindValue(entryType: EntryType, direction: Direction): string {
  if (!entryType) return ''
  if (entryType === 'Email') return direction ? `email_${direction}` : ''
  if (entryType === 'Email Thread') return direction ? `thread_${direction}` : ''
  if (entryType === 'Call') return direction === 'sent' ? 'call_made' : direction === 'received' ? 'call_received' : ''
  if (entryType === 'Meeting') return 'meeting'
  if (entryType === 'Note') return 'note'
  return ''
}

export function EntryDetailsSection({
  entryDateOnly, entryTime, entryType, direction,
  internalSender, threadParticipants, errors,
  onDateChange, onTimeChange, onKindChange,
  onInternalSenderChange, onThreadParticipantsChange,
}: Props) {
  return (
    <div className="bg-gray-50 border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Entry Details</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="entryDateOnly" className="block mb-2 font-semibold">
            Entry Date <span className="text-red-600">*</span>
          </Label>
          <Input
            id="entryDateOnly"
            type="date"
            value={entryDateOnly}
            onChange={(e) => onDateChange(e.target.value)}
            className={`w-full ${errors.entryDate ? 'border-red-600' : ''}`}
          />
          {errors.entryDate && <p className="text-red-600 text-xs mt-1">{errors.entryDate}</p>}
        </div>

        <div>
          <Label htmlFor="entryTime" className="block mb-2 font-semibold">
            Entry Time (optional)
          </Label>
          <Input
            id="entryTime"
            type="time"
            value={entryTime}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-full"
            placeholder="Leave blank if time unknown"
          />
          <p className="text-gray-500 text-xs mt-1">Leave blank if time is unknown</p>
        </div>

        <div>
          <Label htmlFor="entryKind" className="block mb-2 font-semibold">
            What kind of entry is this?
          </Label>
          <select
            id="entryKind"
            value={kindValue(entryType, direction)}
            onChange={(e) => {
              const picked = KIND_MAP[e.target.value]
              if (picked) onKindChange(picked.type, picked.dir)
              else onKindChange('', '')
            }}
            className={`w-full px-3 py-2 border ${errors.direction ? 'border-red-400' : 'border-gray-200'} focus:outline-none focus:border-brand-navy`}
          >
            <option value="">Not specified</option>
            <optgroup label="Email">
              <option value="email_received">I received an email</option>
              <option value="email_sent">I sent an email</option>
            </optgroup>
            <optgroup label="Email Thread">
              <option value="thread_received">I received an email thread</option>
              <option value="thread_sent">I sent an email thread</option>
            </optgroup>
            <optgroup label="Call">
              <option value="call_received">I received a phone call</option>
              <option value="call_made">I made a phone call</option>
            </optgroup>
            <optgroup label="Other">
              <option value="meeting">I had a meeting</option>
              <option value="note">I&apos;m adding a note</option>
            </optgroup>
          </select>
          {errors.direction && <p className="text-red-600 text-xs mt-1">{errors.direction}</p>}
        </div>

        {entryType === 'Email Thread' && (
          <div>
            <Label htmlFor="threadParticipants" className="block mb-2 font-semibold">
              Thread between (optional)
            </Label>
            <Input
              id="threadParticipants"
              type="text"
              value={threadParticipants}
              onChange={(e) => onThreadParticipantsChange(e.target.value)}
              placeholder="e.g. Tom and Josh Harrington"
              className="w-full"
            />
          </div>
        )}

        {(entryType === 'Email' || entryType === 'Email Thread') && direction && (
          <div>
            <Label htmlFor="internalSender" className="block mb-2 font-semibold">
              {direction === 'sent' ? 'Sent from' : 'Received by'} (optional)
            </Label>
            <select
              id="internalSender"
              value={internalSender}
              onChange={(e) => onInternalSenderChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:border-brand-navy"
            >
              <option value="">Not specified</option>
              {INTERNAL_SENDER_NAMES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="info@">info@ (shared)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { type ConversationThread } from '@/app/actions/threads'

interface ThreadAssignPanelProps {
  entryId: string
  entryThreadId: string | null | undefined
  threads: ConversationThread[]
  assigningThreadEntryId: string | null
  creatingThreadFor: string | null
  setCreatingThreadFor: (v: string | null) => void
  newThreadName: string
  setNewThreadName: (v: string) => void
  onAssign: (entryId: string, threadId: string | null) => Promise<void>
  onCreateThread: (entryId: string, name: string) => Promise<void>
  onClose: () => void
}

export function ThreadAssignPanel({
  entryId,
  entryThreadId,
  threads,
  creatingThreadFor,
  setCreatingThreadFor,
  newThreadName,
  setNewThreadName,
  onAssign,
  onCreateThread,
  onClose,
}: ThreadAssignPanelProps) {
  return (
    <div className="mt-2 p-3 border-2 border-indigo-300 bg-indigo-50">
      <p className="text-xs font-semibold text-gray-700 mb-2">Assign to thread:</p>
      <div className="flex flex-wrap gap-2">
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={async () => {
              const newId = entryThreadId === thread.id ? null : thread.id
              await onAssign(entryId, newId)
              onClose()
            }}
            className={`px-3 py-1 text-xs border-2 font-semibold ${entryThreadId === thread.id ? 'border-indigo-600 bg-indigo-200 text-indigo-900' : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-400'}`}
          >
            {entryThreadId === thread.id ? `✓ ${thread.name}` : thread.name}
          </button>
        ))}
        {creatingThreadFor === entryId ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newThreadName}
              onChange={(e) => setNewThreadName(e.target.value)}
              placeholder="Thread name…"
              className="px-2 py-1 text-xs border-2 border-gray-300 focus:border-indigo-600 focus:outline-none"
              autoFocus
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newThreadName.trim()) {
                  await onCreateThread(entryId, newThreadName.trim())
                  onClose()
                  setCreatingThreadFor(null)
                  setNewThreadName('')
                } else if (e.key === 'Escape') {
                  setCreatingThreadFor(null)
                }
              }}
            />
            <span className="text-xs text-gray-500">Enter to save</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingThreadFor(entryId)}
            className="px-3 py-1 text-xs border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-700"
          >
            + New thread
          </button>
        )}
      </div>
    </div>
  )
}

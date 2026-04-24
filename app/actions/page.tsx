import {
  getNeedsReply,
  getOutstandingActions,
  getPureReminders,
  getContractExpiries,
  getCommitmentAlerts,
} from '@/app/actions/correspondence'
import { ActionsClient } from './_components/ActionsClient'

type Raw = { data?: unknown[]; error?: string | null }

async function safe(p: Promise<unknown>): Promise<Raw> {
  try {
    const result = (await p) as Raw
    return result ?? { data: [], error: null }
  } catch {
    return { data: [], error: null }
  }
}

export default async function ActionsPage() {
  const [needsReply, flagged, reminders, contracts, commitments] = await Promise.all([
    safe(getNeedsReply()),
    safe(getOutstandingActions()),
    safe(getPureReminders()),
    safe(getContractExpiries()),
    safe(getCommitmentAlerts()),
  ])

  return (
    <ActionsClient
      initial={{
        needsReply: needsReply as { data?: Record<string, unknown>[]; error?: string | null },
        flagged: flagged as { data?: Record<string, unknown>[]; error?: string | null },
        reminders: reminders as { data?: Record<string, unknown>[]; error?: string | null },
        contracts: contracts as { data?: Record<string, unknown>[]; error?: string | null },
        commitments: commitments as { data?: Record<string, unknown>[]; error?: string | null },
      }}
    />
  )
}

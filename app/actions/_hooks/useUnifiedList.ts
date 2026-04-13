'use client'

import { useMemo } from 'react'
import { formatDateGB, daysAgoFn, daysUntilFn } from '../_utils'
import type { CorrespondenceItem, BusinessItem, ContractItem, Badge, UnifiedItem } from '../_types'

function buildUnifiedList(
  needsReply: CorrespondenceItem[],
  goneQuiet: BusinessItem[],
  flagged: CorrespondenceItem[],
  reminders: CorrespondenceItem[],
  contracts: ContractItem[],
): UnifiedItem[] {
  const corrSeen = new Set<string>()
  const bizSeen = new Set<string>()
  const items: UnifiedItem[] = []

  // 1. REPLY — always first, sorted by age (oldest = most urgent)
  for (const item of needsReply) {
    if (corrSeen.has(item.id)) continue
    corrSeen.add(item.id)
    const days = item.daysAgo ?? 0
    items.push({
      ...item,
      badge: 'REPLY',
      urgencyScore: days >= 7 ? 1 : 2,
      badgeLabel: days === 1 ? 'No reply · 1 day' : `No reply · ${days} days`,
    })
  }

  // 2. Flagged — sorted by due date urgency
  for (const item of flagged) {
    if (corrSeen.has(item.id)) continue
    corrSeen.add(item.id)
    if (!item.due_at) {
      items.push({ ...item, badge: 'FLAG', urgencyScore: 8, badgeLabel: 'Flagged' })
      continue
    }
    const until = daysUntilFn(item.due_at)
    let badge: Badge, urgencyScore: number, badgeLabel: string
    if (until < 0) {
      const abs = Math.abs(until)
      badge = 'OVERDUE'; urgencyScore = 3
      badgeLabel = abs === 1 ? 'Overdue · 1 day' : `Overdue · ${abs} days`
    } else if (until === 0) {
      badge = 'DUE_TODAY'; urgencyScore = 4; badgeLabel = 'Due today'
    } else if (until === 1) {
      badge = 'DUE_TOMORROW'; urgencyScore = 5; badgeLabel = 'Due tomorrow'
    } else if (until <= 3) {
      badge = 'DUE_SOON'; urgencyScore = 6; badgeLabel = `Due in ${until} days`
    } else {
      badge = 'FLAG'; urgencyScore = 8; badgeLabel = `Due ${formatDateGB(item.due_at)}`
    }
    items.push({ ...item, badge, urgencyScore, badgeLabel })
  }

  // 3. Contract expiries — expired contracts first (EXPIRED badge), then upcoming (RENEWAL)
  for (const item of contracts) {
    if (bizSeen.has(item.business_id)) continue
    bizSeen.add(item.business_id)
    const until = daysUntilFn(item.contract_end)
    if (until < 0) {
      const daysAgo = Math.abs(until)
      items.push({
        ...item,
        badge: 'EXPIRED',
        urgencyScore: 3.5,
        badgeLabel: daysAgo === 1 ? 'Contract expired · 1 day ago' : `Contract expired · ${daysAgo} days ago`,
      })
    } else {
      const urgencyScore = until < 7 ? 7 : 9
      items.push({
        ...item,
        badge: 'RENEWAL',
        urgencyScore,
        badgeLabel: `Contract ends ${formatDateGB(item.contract_end)}`,
      })
    }
  }

  // 4. Gone quiet businesses (skip if already shown as contract)
  for (const item of goneQuiet) {
    if (bizSeen.has(item.business_id)) continue
    bizSeen.add(item.business_id)
    const days = daysAgoFn(item.last_contacted_at)
    items.push({
      ...item,
      badge: 'QUIET',
      urgencyScore: 10,
      badgeLabel: `Quiet · ${days} days`,
    })
  }

  // 5. Reminders
  for (const item of reminders) {
    if (corrSeen.has(item.id)) continue
    corrSeen.add(item.id)
    items.push({
      ...item,
      badge: 'REMINDER',
      urgencyScore: 11,
      badgeLabel: item.due_at ? `Due ${formatDateGB(item.due_at)}` : 'Reminder',
    })
  }

  // Sort: urgencyScore ASC, then secondary
  items.sort((a, b) => {
    if (a.urgencyScore !== b.urgencyScore) return a.urgencyScore - b.urgencyScore
    if (a.badge === 'REPLY' && b.badge === 'REPLY') {
      const aD = (a as CorrespondenceItem).daysAgo ?? 0
      const bD = (b as CorrespondenceItem).daysAgo ?? 0
      return bD - aD
    }
    if (a.kind === 'correspondence' && b.kind === 'correspondence') {
      const aC = a as CorrespondenceItem; const bC = b as CorrespondenceItem
      if (aC.due_at && bC.due_at) return new Date(aC.due_at).getTime() - new Date(bC.due_at).getTime()
    }
    if (a.kind === 'contract' && b.kind === 'contract') {
      return new Date((a as ContractItem).contract_end).getTime() - new Date((b as ContractItem).contract_end).getTime()
    }
    return 0
  })

  return items
}

export function useUnifiedList(
  needsReply: CorrespondenceItem[],
  goneQuiet: BusinessItem[],
  flagged: CorrespondenceItem[],
  reminders: CorrespondenceItem[],
  contracts: ContractItem[],
) {
  const unifiedList = useMemo(
    () => buildUnifiedList(needsReply, goneQuiet, flagged, reminders, contracts),
    [needsReply, goneQuiet, flagged, reminders, contracts],
  )

  const sections = useMemo(() => {
    const reply     = unifiedList.filter(i => i.badge === 'REPLY')
    const actions   = unifiedList.filter(i => ['OVERDUE', 'DUE_TODAY', 'DUE_TOMORROW', 'DUE_SOON', 'FLAG'].includes(i.badge))
    const renewals  = unifiedList.filter(i => i.badge === 'RENEWAL' || i.badge === 'EXPIRED')
    const quiet     = unifiedList.filter(i => i.badge === 'QUIET')
    const reminderItems = unifiedList.filter(i => i.badge === 'REMINDER')

    const urgentRenewal = renewals.some(i => {
      const c = i as ContractItem & { badge: Badge; urgencyScore: number; badgeLabel: string }
      return daysUntilFn(c.contract_end) < 7 // includes negative (expired)
    })

    const oldestReply = reply.length ? Math.max(...reply.map(i => (i as CorrespondenceItem).daysAgo ?? 0)) : 0
    const replySubtitle = reply.length
      ? `oldest ${oldestReply} days · ${reply.filter(i => ((i as CorrespondenceItem).daysAgo ?? 0) >= 7).length} overdue`
      : ''

    const overdue   = actions.filter(i => i.badge === 'OVERDUE').length
    const dueToday  = actions.filter(i => i.badge === 'DUE_TODAY').length
    const flaggedCount = actions.filter(i => i.badge === 'FLAG').length
    const actParts: string[] = []
    if (overdue)       actParts.push(`${overdue} overdue`)
    if (dueToday)      actParts.push(`${dueToday} due today`)
    if (flaggedCount)  actParts.push(`${flaggedCount} flagged`)
    const actionsSubtitle = actParts.join(' · ')

    const renewalSubtitle = renewals.length
      ? renewals.map(i => {
          const c = i as ContractItem & { badge: Badge; urgencyScore: number; badgeLabel: string }
          const days = daysUntilFn(c.contract_end)
          if (days < 0) return `${c.business_name} — expired`
          return days < 7 ? `${c.business_name} — ${days}d` : c.business_name
        }).join(', ')
      : ''

    return {
      reply,
      actions,
      renewals,
      quiet,
      reminders: reminderItems,
      urgentRenewal,
      replySubtitle,
      actionsSubtitle,
      renewalSubtitle,
    }
  }, [unifiedList])

  const urgentSummary = useMemo(() => {
    const parts: string[] = []
    if (sections.reply.length) parts.push(`${sections.reply.length} ${sections.reply.length === 1 ? 'reply' : 'replies'} needed`)
    if (sections.actions.length) parts.push(`${sections.actions.length} action${sections.actions.length === 1 ? '' : 's'} due`)
    return parts.join(' · ')
  }, [sections])

  return { unifiedList, sections, urgentSummary }
}

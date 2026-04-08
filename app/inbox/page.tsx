import { getInboundQueue, getAutoFiledRecent, getDiscardedQueue, getDeadLetters } from '@/app/actions/inbound-email'
import { getBusinesses, type Business } from '@/app/actions/businesses'
import InboxCard from './_components/InboxCard'
import AutoFiledSection from './_components/AutoFiledSection'
import DiscardedSection from './_components/DiscardedSection'
import FailedSection from './_components/FailedSection'

export const metadata = {
  title: 'Inbox — Correspondence Clerk',
}

export default async function InboxPage() {
  const [queueResult, businessesResult, autoFiledResult, discardedResult, deadLettersResult] = await Promise.all([
    getInboundQueue(),
    getBusinesses(),
    getAutoFiledRecent(),
    getDiscardedQueue(),
    getDeadLetters(),
  ])

  const items = queueResult.data ?? []
  const businesses = (businessesResult.data ?? []) as Business[]
  const autoFiled = autoFiledResult.data ?? []
  const discarded = discardedResult.data ?? []
  const deadLetters = deadLettersResult.data ?? []

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--brand-dark)' }}
        >
          Inbox
        </h1>
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
          Emails forwarded to your inbound address that need filing.
        </p>
      </div>

      {items.length === 0 ? (
        <div
          className="rounded p-10 text-center"
          style={{ background: '#FAFAF8', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <p
            className="text-xl mb-2"
            style={{ fontFamily: 'Lora, Georgia, serif', color: 'var(--brand-dark)' }}
          >
            You&rsquo;re all caught up
          </p>
          <p className="text-sm" style={{ color: 'rgba(0,0,0,0.5)' }}>
            No emails waiting to be filed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <InboxCard key={item.id} item={item} businesses={businesses} />
          ))}
        </div>
      )}

      <AutoFiledSection items={autoFiled} />
      <DiscardedSection items={discarded} />
      <FailedSection items={deadLetters} />
    </div>
  )
}

'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="container mx-auto px-4 py-16 max-w-lg text-center">
      <h2 className="text-2xl font-bold text-[#1E293B] mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
        Something went wrong
      </h2>
      <p className="text-gray-600 mb-6">
        The dashboard couldn&apos;t load. Your data is safe — this is a temporary issue.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 mb-6 font-mono">{error.digest}</p>
      )}
      <button
        onClick={reset}
        className="px-6 py-2 bg-[#2C4A6E] text-white font-medium hover:bg-[#243d5c] transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

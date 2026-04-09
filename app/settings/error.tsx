'use client'

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="container mx-auto px-4 py-16 max-w-lg text-center">
      <h2 className="text-2xl font-bold text-brand-dark font-serif mb-3">
        Something went wrong
      </h2>
      <p className="text-gray-600 mb-6">
        Settings couldn&apos;t load. Your data is safe — this is a temporary issue.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 mb-6 font-mono">{error.digest}</p>
      )}
      <button
        onClick={reset}
        className="px-6 py-2 bg-brand-navy text-white font-medium hover:bg-brand-navy-hover transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

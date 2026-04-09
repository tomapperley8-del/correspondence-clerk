export default function ActionsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 w-32 bg-gray-200 animate-pulse mb-2" />
        <div className="h-4 w-56 bg-gray-200 animate-pulse" />
      </div>

      {/* Sections skeleton */}
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="mb-6">
          {/* Section header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-5 w-36 bg-gray-200 animate-pulse" />
            <div className="h-5 w-8 bg-gray-200 animate-pulse rounded-full" />
          </div>

          {/* Item cards */}
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="border border-gray-200 p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-5 w-16 bg-gray-200 rounded-full" />
                  <div className="h-5 w-40 bg-gray-200" />
                </div>
                <div className="h-4 w-3/4 bg-gray-200 mb-2" />
                <div className="h-4 w-1/2 bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

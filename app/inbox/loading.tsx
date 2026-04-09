export default function InboxLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 w-24 bg-gray-200 animate-pulse mb-2" />
        <div className="h-4 w-72 bg-gray-200 animate-pulse" />
      </div>

      {/* Queue items skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-gray-200 p-5 animate-pulse">
            <div className="h-5 w-2/3 bg-gray-200 mb-3" />
            <div className="h-4 w-1/2 bg-gray-200 mb-2" />
            <div className="h-4 w-1/3 bg-gray-200 mb-4" />
            <div className="flex gap-2">
              <div className="h-8 w-24 bg-gray-200" />
              <div className="h-8 w-20 bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

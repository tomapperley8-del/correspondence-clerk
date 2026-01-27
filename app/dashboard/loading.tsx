export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header skeleton */}
      <div className="flex justify-between items-center mb-6">
        <div className="h-8 w-48 bg-gray-200 animate-pulse" />
        <div className="h-10 w-32 bg-gray-200 animate-pulse" />
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-4 mb-6">
        <div className="h-10 w-64 bg-gray-200 animate-pulse" />
        <div className="h-10 w-32 bg-gray-200 animate-pulse" />
        <div className="h-10 w-32 bg-gray-200 animate-pulse" />
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="border-2 border-gray-200 p-6 animate-pulse">
            <div className="h-6 w-3/4 bg-gray-200 mb-3" />
            <div className="h-4 w-1/2 bg-gray-200 mb-2" />
            <div className="h-4 w-1/3 bg-gray-200 mb-4" />
            <div className="flex gap-2">
              <div className="h-6 w-16 bg-gray-200" />
              <div className="h-6 w-20 bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SearchLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title skeleton */}
      <div className="h-8 w-24 bg-gray-200 animate-pulse mb-6" />

      {/* Search bar skeleton */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1 h-12 bg-gray-200 animate-pulse" />
        <div className="h-12 w-28 bg-gray-200 animate-pulse" />
      </div>

      {/* Hint area skeleton */}
      <div className="bg-gray-50 border-2 border-gray-200 p-8 animate-pulse">
        <div className="h-4 w-64 bg-gray-200 mx-auto mb-2" />
        <div className="h-3 w-48 bg-gray-200 mx-auto" />
      </div>
    </div>
  )
}

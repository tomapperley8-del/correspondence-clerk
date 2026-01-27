export default function BusinessDetailLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb skeleton */}
      <div className="h-4 w-48 bg-gray-200 animate-pulse mb-4" />

      {/* Business header skeleton */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="h-8 w-64 bg-gray-200 animate-pulse mb-2" />
          <div className="flex gap-2">
            <div className="h-6 w-20 bg-gray-200 animate-pulse" />
            <div className="h-6 w-24 bg-gray-200 animate-pulse" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-gray-200 animate-pulse" />
          <div className="h-10 w-24 bg-gray-200 animate-pulse" />
        </div>
      </div>

      {/* Contacts skeleton */}
      <div className="border-2 border-gray-200 p-6 mb-6 animate-pulse">
        <div className="h-6 w-24 bg-gray-200 mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-48 bg-gray-200" />
          <div className="h-4 w-40 bg-gray-200" />
        </div>
      </div>

      {/* Correspondence skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-2 border-gray-200 p-6 animate-pulse">
            <div className="h-5 w-3/4 bg-gray-200 mb-3" />
            <div className="h-4 w-1/2 bg-gray-200 mb-2" />
            <div className="h-4 w-full bg-gray-200 mb-1" />
            <div className="h-4 w-5/6 bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}

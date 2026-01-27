export default function NewEntryLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title skeleton */}
      <div className="h-8 w-32 bg-gray-200 animate-pulse mb-6" />

      <div className="space-y-6">
        {/* Business selector skeleton */}
        <div className="animate-pulse">
          <div className="h-5 w-24 bg-gray-200 mb-2" />
          <div className="h-10 w-full bg-gray-200" />
        </div>

        {/* Contact selector skeleton */}
        <div className="animate-pulse">
          <div className="h-5 w-24 bg-gray-200 mb-2" />
          <div className="h-10 w-full bg-gray-200" />
        </div>

        {/* Entry details skeleton */}
        <div className="bg-gray-50 border-2 border-gray-200 p-6 animate-pulse">
          <div className="h-6 w-28 bg-gray-200 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="h-5 w-20 bg-gray-200 mb-2" />
              <div className="h-10 w-full bg-gray-200" />
            </div>
            <div>
              <div className="h-5 w-20 bg-gray-200 mb-2" />
              <div className="h-10 w-full bg-gray-200" />
            </div>
          </div>
        </div>

        {/* Textarea skeleton */}
        <div className="animate-pulse">
          <div className="h-5 w-24 bg-gray-200 mb-2" />
          <div className="h-72 w-full bg-gray-200" />
        </div>

        {/* Button skeleton */}
        <div className="flex gap-4 animate-pulse">
          <div className="h-12 w-32 bg-gray-200" />
          <div className="h-12 w-24 bg-gray-200" />
        </div>
      </div>
    </div>
  )
}

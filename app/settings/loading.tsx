export default function SettingsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header skeleton */}
      <div className="h-8 w-28 bg-gray-200 animate-pulse mb-8" />

      {/* Profile section skeleton */}
      <div className="border border-gray-200 p-6 mb-6 animate-pulse">
        <div className="h-5 w-32 bg-gray-200 mb-4" />
        <div className="space-y-4">
          <div>
            <div className="h-4 w-20 bg-gray-200 mb-2" />
            <div className="h-10 w-full bg-gray-200" />
          </div>
          <div>
            <div className="h-4 w-16 bg-gray-200 mb-2" />
            <div className="h-10 w-full bg-gray-200" />
          </div>
        </div>
      </div>

      {/* Tools section skeleton */}
      <div className="border border-gray-200 p-6 mb-6 animate-pulse">
        <div className="h-5 w-24 bg-gray-200 mb-4" />
        <div className="space-y-3">
          <div className="h-10 w-full bg-gray-200" />
          <div className="h-10 w-full bg-gray-200" />
        </div>
      </div>

      {/* Email section skeleton */}
      <div className="border border-gray-200 p-6 animate-pulse">
        <div className="h-5 w-36 bg-gray-200 mb-4" />
        <div className="h-10 w-full bg-gray-200 mb-3" />
        <div className="h-4 w-2/3 bg-gray-200" />
      </div>
    </div>
  )
}

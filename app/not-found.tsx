import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-paper px-4">
      <div className="text-center max-w-md">
        <p className="text-7xl font-bold text-brand-navy mb-4" style={{ fontFamily: 'Lora, serif' }}>
          404
        </p>
        <h1 className="text-2xl font-semibold text-brand-dark mb-3" style={{ fontFamily: 'Lora, serif' }}>
          Page not found
        </h1>
        <p className="text-gray-600 mb-8">
          That page doesn&rsquo;t exist or has moved. Head back to your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-brand-navy text-white font-semibold hover:bg-brand-navy-hover transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

import Link from 'next/link'

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border-2 border-red-600 p-8">
          <h1 className="text-2xl font-bold mb-4 text-gray-900">
            Authentication Error
          </h1>
          <p className="text-gray-700 mb-6">
            There was an error confirming your email. The link may have expired
            or already been used.
          </p>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Return to login
          </Link>
        </div>
      </div>
    </div>
  )
}

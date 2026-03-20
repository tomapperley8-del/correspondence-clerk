import type { Metadata } from 'next'
import '../globals.css'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Correspondence Clerk',
}

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b-2 border-gray-800">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Correspondence Clerk
            </Link>
            <div className="flex gap-4">
              <Link
                href="/login"
                className="px-4 py-2 text-gray-700 font-semibold hover:text-blue-600"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 border-2 border-blue-600"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="container mx-auto px-4 py-12 max-w-4xl">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t-2 border-gray-800 py-8 mt-12">
          <div className="container mx-auto px-4 text-center text-gray-600">
            <p>&copy; {new Date().getFullYear()} Correspondence Clerk. All rights reserved.</p>
            <div className="mt-4 space-x-4">
              <Link href="/terms" className="hover:text-blue-600">
                Terms of Service
              </Link>
              <Link href="/privacy" className="hover:text-blue-600">
                Privacy Policy
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}

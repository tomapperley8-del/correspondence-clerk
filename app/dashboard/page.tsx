import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getBusinesses } from '@/app/actions/businesses'
import { AddBusinessButton } from '@/components/AddBusinessButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const result = await getBusinesses()

  if ('error' in result) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="border-2 border-red-600 bg-red-50 px-4 py-3">
          <p className="text-red-800">Error loading businesses: {result.error}</p>
        </div>
      </div>
    )
  }

  const businesses = result.data || []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <AddBusinessButton />
      </div>

      {businesses.length === 0 ? (
        <div className="bg-white border border-gray-300 p-12 text-center">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            No Businesses Yet
          </h2>
          <p className="text-gray-600 mb-6">
            Get started by adding your first business to track correspondence.
          </p>
          <AddBusinessButton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {businesses.map((business) => (
            <Link
              key={business.id}
              href={`/businesses/${business.id}`}
              className="bg-white border-2 border-gray-300 p-6 hover:border-blue-600 hover:bg-blue-50 transition-colors duration-150"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {business.name}
              </h3>

              {(business.category || business.status) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {business.category && (
                    <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">
                      {business.category}
                    </span>
                  )}
                  {business.status && (
                    <span className="text-xs bg-gray-200 px-2 py-1 text-gray-700">
                      {business.status}
                    </span>
                  )}
                </div>
              )}

              {(business.is_club_card || business.is_advertiser) && (
                <div className="flex gap-2 mb-3">
                  {business.is_club_card && (
                    <span className="text-xs bg-blue-100 px-2 py-1 text-blue-800">
                      Club Card
                    </span>
                  )}
                  {business.is_advertiser && (
                    <span className="text-xs bg-green-100 px-2 py-1 text-green-800">
                      Advertiser
                    </span>
                  )}
                </div>
              )}

              {business.last_contacted_at && (
                <p className="text-sm text-gray-600 mt-3">
                  Last contacted:{' '}
                  {new Date(business.last_contacted_at).toLocaleDateString('en-GB')}
                </p>
              )}

              {!business.last_contacted_at && (
                <p className="text-sm text-gray-500 mt-3 italic">
                  No correspondence yet
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SearchPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold mb-6">Search</h1>

      <div className="bg-white border border-gray-300 p-6">
        <p className="text-gray-600 text-sm">
          This page will be implemented in Step 7.
        </p>
      </div>
    </div>
  )
}

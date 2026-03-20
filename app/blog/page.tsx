import { Metadata } from 'next'
import Link from 'next/link'
import { getPublishedPosts } from '@/lib/marketing/blog-generator'

export const metadata: Metadata = {
  title: 'Blog | Correspondence Clerk',
  description: 'Practical advice on managing client correspondence. No fluff.',
}

// Use dynamic rendering since blog posts change frequently
export const dynamic = 'force-dynamic'

export default async function BlogPage() {
  const posts = await getPublishedPosts(20)

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-lg font-medium">
              Correspondence Clerk
            </Link>
            <div className="flex gap-4 items-center text-sm">
              <Link href="/login" className="text-gray-600 hover:text-gray-900">
                Log in
              </Link>
              <Link
                href="/signup"
                className="bg-gray-900 text-white px-4 py-2 hover:bg-gray-800"
              >
                Try free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-medium text-gray-900 mb-2">Blog</h1>
          <p className="text-gray-600">
            Practical advice on managing client correspondence. No fluff.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="pb-16 px-4">
        <div className="max-w-2xl mx-auto">
          {posts.length === 0 ? (
            <p className="text-gray-500">No posts yet. Check back soon.</p>
          ) : (
            <div className="space-y-12">
              {posts.map((post) => (
                <article key={post.slug}>
                  <Link href={`/blog/${post.slug}`} className="group">
                    <h2 className="text-xl font-medium text-gray-900 group-hover:text-gray-600 mb-2">
                      {post.title}
                    </h2>
                    <p className="text-gray-600 mb-2">{post.excerpt}</p>
                    <p className="text-sm text-gray-400">
                      {new Date(post.published_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-100">
        <div className="max-w-2xl mx-auto flex justify-between items-center text-sm text-gray-400">
          <span>Correspondence Clerk</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-gray-600">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPostBySlug } from '@/lib/marketing/blog-generator'

// Use dynamic rendering since blog posts change frequently
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)

  if (!post) {
    return { title: 'Not Found' }
  }

  return {
    title: `${post.title} | Correspondence Clerk`,
    description: post.meta_description || post.excerpt,
    keywords: post.meta_keywords?.join(', '),
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getPostBySlug(slug)

  if (!post) {
    notFound()
  }

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
              <Link href="/blog" className="text-gray-600 hover:text-gray-900">
                Blog
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

      {/* Article */}
      <article className="py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <p className="text-sm text-gray-400 mb-2">
              {new Date(post.published_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <h1 className="text-3xl font-medium text-gray-900 mb-4">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="text-lg text-gray-600">{post.excerpt}</p>
            )}
          </header>

          {/* Content - rendered as markdown */}
          <div
            className="prose prose-gray max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
          />
        </div>
      </article>

      {/* CTA */}
      <section className="py-12 px-4 bg-gray-50 border-y border-gray-100">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-gray-700 mb-4">
            Correspondence Clerk helps you keep track of important client emails.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gray-900 text-white px-5 py-2 hover:bg-gray-800"
          >
            Try it free
          </Link>
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

/**
 * Simple markdown to HTML converter
 */
function renderMarkdown(markdown: string): string {
  let html = markdown

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-medium mt-8 mb-3">$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-medium mt-10 mb-4">$1</h2>')

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>')

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="mb-4">')
  html = '<p class="mb-4">' + html + '</p>'

  // Lists
  html = html.replace(/^\- (.+)$/gim, '<li class="ml-4">$1</li>')
  html = html.replace(/(<li.*<\/li>\n?)+/g, '<ul class="list-disc mb-4">$&</ul>')

  return html
}

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAllIndustrySlugs, getIndustryBySlug } from '@/lib/marketing/industry-data'

interface PageProps {
  params: Promise<{ industry: string }>
}

export async function generateStaticParams() {
  const slugs = getAllIndustrySlugs()
  return slugs.map((industry) => ({ industry }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { industry: slug } = await params
  const industry = getIndustryBySlug(slug)

  if (!industry) {
    return { title: 'Not Found' }
  }

  return {
    title: industry.metaTitle,
    description: industry.metaDescription,
    openGraph: {
      title: industry.metaTitle,
      description: industry.metaDescription,
      type: 'website',
    },
  }
}

export default async function IndustryPage({ params }: PageProps) {
  const { industry: slug } = await params
  const industry = getIndustryBySlug(slug)

  if (!industry) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
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

      {/* Hero - calm, not shouty */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-gray-500 text-sm mb-3">
            For {industry.name}
          </p>
          <h1 className="text-3xl font-medium text-gray-900 mb-4">
            {industry.heroTitle}
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            {industry.heroSubtitle}
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gray-900 text-white px-5 py-3 hover:bg-gray-800"
          >
            Try it free for 14 days
          </Link>
          <p className="text-sm text-gray-400 mt-3">
            No card required. £7/month after.
          </p>
        </div>
      </section>

      {/* The problem - relatable, human */}
      <section className="py-12 px-4 bg-gray-50 border-y border-gray-100">
        <div className="max-w-2xl mx-auto">
          <p className="text-gray-700 text-lg">
            {industry.problem}
          </p>
        </div>
      </section>

      {/* Features - simple, not flashy */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-medium text-gray-900 mb-8">
            What it does
          </h2>
          <div className="space-y-8">
            {industry.features.map((feature, index) => (
              <div key={index}>
                <h3 className="font-medium text-gray-900 mb-1">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs - conversational */}
      <section className="py-16 px-4 bg-gray-50 border-y border-gray-100">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-medium text-gray-900 mb-8">
            Questions
          </h2>
          <div className="space-y-8">
            {industry.faqs.map((faq, index) => (
              <div key={index}>
                <h3 className="font-medium text-gray-900 mb-2">
                  {faq.question}
                </h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA - quiet, not pushy */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-lg text-gray-700 mb-6">
            If keeping track of client correspondence is a problem you recognise, give it a try.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gray-900 text-white px-6 py-3 hover:bg-gray-800"
          >
            Start free trial
          </Link>
          <p className="text-sm text-gray-400 mt-3">
            14 days free. No card needed.
          </p>
        </div>
      </section>

      {/* Related - helpful, not aggressive */}
      {industry.relatedIndustries.length > 0 && (
        <section className="py-12 px-4 border-t border-gray-100">
          <div className="max-w-2xl mx-auto">
            <p className="text-sm text-gray-500 mb-3">
              Also useful for
            </p>
            <div className="flex flex-wrap gap-2">
              {industry.relatedIndustries.map((related) => (
                <Link
                  key={related}
                  href={`/for/${related}`}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  {related.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer - minimal */}
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

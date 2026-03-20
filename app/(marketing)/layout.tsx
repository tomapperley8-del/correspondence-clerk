import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Correspondence Clerk - Turn messy correspondence into organized letter files',
  description:
    'AI-powered correspondence management for businesses. Import emails, format conversations, and maintain professional letter files with ease.',
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

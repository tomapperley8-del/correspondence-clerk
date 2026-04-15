import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navigation } from '@/components/Navigation'
import { InsightsProvider } from '@/components/InsightsContext'
import { ToastContainer } from '@/components/Toast'
import { DynamicPanels } from '@/components/DynamicPanels'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Correspondence Clerk',
  description: 'Know exactly what needs your attention today. An AI assistant that reads your business correspondence and tells you who to reply to, which contracts are expiring, and which follow-ups have gone cold.',
  icons: { icon: '/icon.svg' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Lora:wght@400;500;600;700&display=swap"
        />
        {supabaseUrl && <link rel="preconnect" href={supabaseUrl} />}
      </head>
      <body>
        <InsightsProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-brand-navy focus:text-white focus:px-4 focus:py-2 focus:font-semibold"
          >
            Skip to main content
          </a>
          <Navigation />
          <DynamicPanels />
          <ToastContainer />
          <main id="main-content" className="pb-16 md:pb-0">{children}</main>
        </InsightsProvider>
</body>
    </html>
  )
}

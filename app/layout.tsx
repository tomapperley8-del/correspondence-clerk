import type { Metadata } from 'next'
import { Lora, Inter } from 'next/font/google'
import './globals.css'
import { Navigation } from '@/components/Navigation'
import { ChatProvider } from '@/components/ChatContext'
import { ToastContainer } from '@/components/Toast'
import { DynamicPanels } from '@/components/DynamicPanels'

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-lora',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Correspondence Clerk',
  description: 'Know exactly what needs your attention today. An AI assistant that reads your business correspondence and tells you who to reply to, which contracts are expiring, and which follow-ups have gone cold.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${lora.variable} ${inter.variable}`}>
      <body>
        <ChatProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:font-semibold"
          >
            Skip to main content
          </a>
          <Navigation />
          <DynamicPanels />
          <ToastContainer />
          <main id="main-content">{children}</main>
        </ChatProvider>
      </body>
    </html>
  )
}

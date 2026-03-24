import type { Metadata } from 'next'
import './globals.css'
import { Navigation } from '@/components/Navigation'
import { ChatProvider } from '@/components/ChatContext'
import { ChatPanel } from '@/components/ChatPanel'
import { CommandSearch } from '@/components/CommandSearch'
import { ToastContainer } from '@/components/Toast'

export const metadata: Metadata = {
  title: 'Correspondence Clerk',
  description: 'Turn messy correspondence into clean, chronological letter files',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {/* Warm, editorial fonts - Lora for headings, Inter for body */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ChatProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:font-semibold"
          >
            Skip to main content
          </a>
          <Navigation />
          <ChatPanel />
          <CommandSearch />
          <ToastContainer />
          <main id="main-content">{children}</main>
        </ChatProvider>
      </body>
    </html>
  )
}

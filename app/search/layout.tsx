import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Search — Correspondence Clerk',
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

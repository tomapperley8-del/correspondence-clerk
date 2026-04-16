import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'New Entry — Correspondence Clerk',
}

export default function NewEntryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Actions — Correspondence Clerk',
}

export default function ActionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

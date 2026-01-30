import { requireAdmin } from '@/lib/admin-check'
import ImportGoogleDocsClient from './ImportGoogleDocsClient'

export default async function ImportGoogleDocsPage() {
  await requireAdmin()
  return <ImportGoogleDocsClient />
}

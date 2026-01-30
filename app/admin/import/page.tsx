import { requireAdmin } from '@/lib/admin-check'
import ImportClient from './ImportClient'

export default async function ImportPage() {
  await requireAdmin()
  return <ImportClient />
}

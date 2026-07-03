import { getAllArticles } from '@/app/actions/articles'
import { ArticlesListClient } from './_components/ArticlesListClient'

export const metadata = {
  title: 'News Coverage — Correspondence Clerk',
}

export default async function ArticlesPage() {
  const articles = await getAllArticles()

  return <ArticlesListClient initialArticles={articles} />
}

import { PageSkeleton, SkeletonBox } from '@/components/ui/page-skeleton'

export default function ListingsLoading() {
  return (
    <PageSkeleton label="Listings" width="max-w-[1400px]">
      <SkeletonBox rows={8} />
    </PageSkeleton>
  )
}

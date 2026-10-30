import { PageSkeleton, SkeletonBox, SkeletonTiles } from '@/components/ui/page-skeleton'

export default function OutreachLoading() {
  return (
    <PageSkeleton label="Outreach" width="max-w-[1400px]">
      <SkeletonTiles count={4} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SkeletonBox rows={5} />
        <SkeletonBox rows={5} />
      </div>
      <SkeletonBox rows={3} />
    </PageSkeleton>
  )
}

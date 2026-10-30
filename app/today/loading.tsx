import { PageSkeleton, SkeletonBox, SkeletonTiles } from '@/components/ui/page-skeleton'

export default function TodayLoading() {
  return (
    <PageSkeleton label="Today" width="max-w-[1440px]">
      <SkeletonBox rows={3} />
      <SkeletonTiles count={4} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SkeletonBox rows={4} />
        <SkeletonBox rows={4} />
        <SkeletonBox rows={2} />
        <SkeletonBox rows={2} />
      </div>
    </PageSkeleton>
  )
}

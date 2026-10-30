import { PageSkeleton, SkeletonBox, SkeletonTiles } from '@/components/ui/page-skeleton'

export default function ClubCardLoading() {
  return (
    <PageSkeleton label="Club Card" width="max-w-[1500px]">
      <SkeletonTiles count={4} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SkeletonBox rows={5} />
        <SkeletonBox rows={5} />
      </div>
      <SkeletonBox rows={3} />
    </PageSkeleton>
  )
}

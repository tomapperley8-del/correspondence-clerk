import { PageSkeleton, SkeletonBox } from '@/components/ui/page-skeleton'

export default function DataHealthLoading() {
  return (
    <PageSkeleton label="Data health" width="max-w-[1100px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonBox key={i} rows={2} />
      ))}
    </PageSkeleton>
  )
}

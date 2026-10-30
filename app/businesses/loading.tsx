import { PageSkeleton, SkeletonTable } from '@/components/ui/page-skeleton'

export default function BusinessesLoading() {
  return (
    <PageSkeleton label="Businesses">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="cc-skel h-8 w-24 rounded-sm" />
        ))}
      </div>
      <SkeletonTable rows={12} />
    </PageSkeleton>
  )
}

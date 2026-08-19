import { cn } from '@/lib/utils'

const bucketTone = {
  empty: 'bg-muted',
  success: 'bg-success',
  mixed: 'bg-warning',
  failed: 'bg-destructive',
} as const

export function StatusTimeline(props: {
  label: string
  buckets: Array<{
    key: string
    tone: keyof typeof bucketTone
    title: string
  }>
}) {
  return (
    <div className='grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div
        className='flex h-4 min-w-0 gap-0.5'
        aria-label={`${props.label} timeline`}
      >
        {props.buckets.map((bucket) => (
          <span
            key={bucket.key}
            className={cn(
              'min-w-0 flex-1 rounded-[1px]',
              bucketTone[bucket.tone]
            )}
            title={bucket.title}
          />
        ))}
      </div>
    </div>
  )
}

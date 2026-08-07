import { cn } from '@/lib/utils'

type BrandWordmarkProps = React.ComponentProps<'span'>

export function BrandWordmark({ className, ...props }: BrandWordmarkProps) {
  return (
    <span
      className={cn(
        'text-foreground font-serif leading-none font-semibold tracking-[-0.035em]',
        className
      )}
      {...props}
    >
      ACUindex
    </span>
  )
}

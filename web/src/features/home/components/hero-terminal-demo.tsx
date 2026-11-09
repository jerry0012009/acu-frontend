import { ConnectionGuide } from '@/features/acu/components/connection-guide'
import { cn } from '@/lib/utils'

import './original-guide.css'

interface HeroTerminalDemoProps {
  className?: string
}

export function HeroTerminalDemo(props: HeroTerminalDemoProps) {
  return (
    <div id='start' className={cn('w-full min-w-0', props.className)}>
      <ConnectionGuide />
    </div>
  )
}

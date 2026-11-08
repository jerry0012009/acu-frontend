import { ConnectionGuide } from '@/features/acu/components/connection-guide'

interface HeroTerminalDemoProps {
  className?: string
}

export function HeroTerminalDemo(props: HeroTerminalDemoProps) {
  return (
    <div className={props.className}>
      <ConnectionGuide />
    </div>
  )
}

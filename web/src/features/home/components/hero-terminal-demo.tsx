import { AcuQuickStart } from '@/features/acu/components/acu-quick-start'

interface HeroTerminalDemoProps {
  className?: string
}

export function HeroTerminalDemo(props: HeroTerminalDemoProps) {
  return <AcuQuickStart mode='preview' className={props.className} />
}

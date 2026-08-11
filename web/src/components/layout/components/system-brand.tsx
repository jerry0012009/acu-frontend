import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { BRAND_DOCUMENT_TITLE, PUBLIC_HOME_URL } from '@/lib/brand'

import { BrandWordmark } from './brand-wordmark'

type SystemBrandProps = {
  /**
   * Visual layout:
   * - 'sidebar': stacked card style (used inside the sidebar header).
   * - 'inline': compact horizontal pill (used inside the top app bar).
   */
  variant?: 'sidebar' | 'inline'
}

/**
 * System brand component
 * Displays the ACUindex horizontal wordmark without duplicating its name.
 * The sidebar variant hides the wordmark instead of compressing it when
 * the sidebar enters icon-only mode.
 */
export function SystemBrand(props: SystemBrandProps) {
  const variant = props.variant ?? 'sidebar'

  if (variant === 'inline') {
    return (
      <a
        href={PUBLIC_HOME_URL}
        aria-label={BRAND_DOCUMENT_TITLE}
        className='hover:bg-accent focus-visible:ring-ring/40 inline-flex h-8 items-center rounded-md px-1 transition-colors outline-none select-none focus-visible:ring-2'
      >
        <BrandWordmark className='text-[22px]' />
      </a>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='hover:text-sidebar-foreground active:text-sidebar-foreground cursor-default hover:bg-transparent active:bg-transparent'
          render={<div />}
        >
          <a
            href={PUBLIC_HOME_URL}
            aria-label={BRAND_DOCUMENT_TITLE}
            className='flex h-8 items-center group-data-[collapsible=icon]:invisible'
          >
            <BrandWordmark className='text-[26px]' />
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

import { Link } from '@tanstack/react-router'

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { BRAND_DOCUMENT_TITLE, BRAND_WORDMARK_URL } from '@/lib/brand'

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
      <Link
        to='/'
        aria-label={BRAND_DOCUMENT_TITLE}
        className='hover:bg-accent focus-visible:ring-ring/40 inline-flex h-8 w-[4.75rem] items-center rounded-md px-1 transition-colors outline-none select-none focus-visible:ring-2 sm:w-[5.25rem]'
      >
        <img
          src={BRAND_WORDMARK_URL}
          alt={BRAND_DOCUMENT_TITLE}
          className='h-7 w-auto max-w-full object-contain'
        />
      </Link>
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
          <div className='flex h-8 w-[5.25rem] items-center group-data-[collapsible=icon]:invisible'>
            <img
              src={BRAND_WORDMARK_URL}
              alt={BRAND_DOCUMENT_TITLE}
              className='h-8 w-auto max-w-full object-contain'
            />
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

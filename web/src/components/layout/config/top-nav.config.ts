import { PUBLIC_HOME_URL } from '@/lib/brand'

import type { TopNavLink } from '../types'

/**
 * Default top navigation links
 *
 * In practice, navigation links are dynamically fetched from backend.
 * Priority: Backend dynamic links > Provided navLinks > defaultTopNavLinks
 *
 * Used while backend navigation configuration is loading or unavailable.
 */
export const defaultTopNavLinks: TopNavLink[] = [
  { title: 'Home', href: PUBLIC_HOME_URL },
  { title: 'Usage Guide', href: '/' },
  { title: 'Console', href: '/dashboard' },
  { title: 'Model Pricing', href: '/pricing' },
]

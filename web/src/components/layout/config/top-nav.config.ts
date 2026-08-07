import { type TopNavLink } from '../types'

/**
 * Default top navigation links
 *
 * In practice, navigation links are dynamically fetched from backend.
 * Priority: Backend dynamic links > Provided navLinks > defaultTopNavLinks
 *
 * Used while backend navigation configuration is loading or unavailable.
 */
export const defaultTopNavLinks: TopNavLink[] = [
  { title: 'Home', href: '/index' },
  { title: 'Usage Guide', href: '/' },
  { title: 'Console', href: '/dashboard' },
  { title: 'Model Pricing', href: '/pricing' },
]

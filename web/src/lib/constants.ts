/**
 * Application-wide constants
 */

import { BRAND_NAME, BRAND_WORDMARK_URL } from '@/lib/brand'

// System Configuration Defaults
export const DEFAULT_SYSTEM_NAME = BRAND_NAME
export const DEFAULT_LOGO = BRAND_WORDMARK_URL

// LocalStorage Keys
export const STORAGE_KEYS = {
  SYSTEM_NAME: 'system_name',
  LOGO: 'logo',
  FOOTER_HTML: 'footer_html',
} as const

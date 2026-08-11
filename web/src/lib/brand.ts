export const BRAND_NAME = 'ACUindex'
export const BRAND_NAME_ZH = '清度'
export const BRAND_DOCUMENT_TITLE = `${BRAND_NAME} · ${BRAND_NAME_ZH}`
export const BRAND_WORDMARK_URL = '/acu-index-site/assets/acuindex-wordmark.png'
export const PUBLIC_HOME_URL = 'http://acucompute.com/'

export function isPublicHomeLink(href: string): boolean {
  return href === PUBLIC_HOME_URL || href === '/index'
}

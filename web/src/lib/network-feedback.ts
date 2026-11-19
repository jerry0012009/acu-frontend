import { AxiosError, isAxiosError } from 'axios'
import { t } from 'i18next'
import { toast } from 'sonner'

export const CONNECTION_ERROR_TOAST_ID = 'connection-error'
const NETWORK_NOTICE_INTERVAL_MS = 15_000
let lastNetworkNoticeAt = -Infinity

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function handleNetworkError(error: unknown): boolean {
  if (!isAxiosError(error) || error.response) return false
  if (error.code === AxiosError.ERR_CANCELED) return true
  if (error.code !== AxiosError.ERR_NETWORK) return false

  // The offline indicator already explains the failure when the OS detects it.
  if (isBrowserOffline()) return true

  const now = Date.now()
  if (now - lastNetworkNoticeAt >= NETWORK_NOTICE_INTERVAL_MS) {
    lastNetworkNoticeAt = now
    toast.error(t('Network connection failed or server not responding'), {
      id: CONNECTION_ERROR_TOAST_ID,
      duration: 4000,
    })
  }
  return true
}

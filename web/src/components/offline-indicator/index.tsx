import { WifiOff } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  CONNECTION_ERROR_TOAST_ID,
  isBrowserOffline,
} from '@/lib/network-feedback'

function subscribeToConnection(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function OfflineIndicator() {
  const { t } = useTranslation()
  const offline = useSyncExternalStore(
    subscribeToConnection,
    isBrowserOffline,
    () => false
  )

  useEffect(() => {
    if (offline) toast.dismiss(CONNECTION_ERROR_TOAST_ID)
  }, [offline])

  return (
    <div
      role='status'
      className='pointer-events-none fixed inset-x-3 bottom-4 z-50 flex justify-start'
    >
      {offline && (
        <div className='bg-popover text-popover-foreground flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm'>
          <WifiOff
            aria-hidden='true'
            className='text-muted-foreground size-4 shrink-0'
          />
          <span className='min-w-0 wrap-anywhere'>{t('You are offline')}</span>
        </div>
      )}
    </div>
  )
}

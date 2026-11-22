import i18next from 'i18next'
import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { formatQuota } from '@/lib/format'

import { redeemTopupCode } from '../api'

// ============================================================================
// Redemption Hook
// ============================================================================

export function useRedemption() {
  const [redeeming, setRedeeming] = useState(false)
  const inFlight = useRef(false)

  const redeemCode = useCallback(async (code: string): Promise<boolean> => {
    if (inFlight.current) return false
    const key = code.trim()
    if (!key) {
      toast.error(i18next.t('Please enter a redemption code'))
      return false
    }

    inFlight.current = true
    try {
      setRedeeming(true)
      const response = await redeemTopupCode({ key })

      if (response.success) {
        toast.success(
          i18next.t('Redemption successful! Added: {{quota}}', {
            quota: formatQuota(response.data ?? 0),
          })
        )
        return true
      }

      toast.error(response.message || i18next.t('Redemption failed'))
      return false
    } catch {
      toast.error(
        i18next.t(
          'Could not confirm redemption. Check your balance before trying again.'
        )
      )
      return false
    } finally {
      inFlight.current = false
      setRedeeming(false)
    }
  }, [])

  return {
    redeeming,
    redeemCode,
  }
}

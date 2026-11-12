import i18next from 'i18next'
import { useState } from 'react'
import { toast } from 'sonner'

import { useCountdown } from '@/hooks/use-countdown'

import { sendEmailVerification } from '../api'
import type { CaptchaAnswer } from '../components/image-captcha'
import { EMAIL_VERIFICATION_COUNTDOWN } from '../constants'

interface UseEmailVerificationOptions {
  captcha?: CaptchaAnswer
}

/**
 * Hook for managing email verification code sending
 */
export function useEmailVerification(options?: UseEmailVerificationOptions) {
  const [isSending, setIsSending] = useState(false)
  const {
    secondsLeft,
    isActive,
    start: startCountdown,
  } = useCountdown({ initialSeconds: EMAIL_VERIFICATION_COUNTDOWN })

  /**
   * Send verification code to email
   */
  const sendCode = async (email: string) => {
    if (!email) {
      toast.error(i18next.t('Please enter your email first'))
      return false
    }

    if (
      !options?.captcha?.captcha_id ||
      options.captcha.captcha_answer.length !== 5
    ) {
      toast.info(i18next.t('Please enter the image verification code'))
      return false
    }

    setIsSending(true)
    try {
      const res = await sendEmailVerification(email, options?.captcha)
      if (res?.success) {
        startCountdown()
        toast.success(i18next.t('Verification email sent'))
        return true
      }
      toast.error(
        res?.message || i18next.t('Failed to send verification email')
      )
      return false
    } catch {
      // Errors are handled by global interceptor
      return false
    } finally {
      setIsSending(false)
    }
  }

  return {
    isSending,
    secondsLeft,
    isActive,
    sendCode,
  }
}

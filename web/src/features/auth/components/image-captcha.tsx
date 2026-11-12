import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

export interface CaptchaAnswer {
  captcha_id: string
  captcha_answer: string
}

interface ImageCaptchaProps {
  purpose: 'login' | 'register' | 'register-email' | 'reset-email'
  onChange: (answer: CaptchaAnswer) => void
}

export function ImageCaptcha(props: ImageCaptchaProps) {
  const { purpose, onChange } = props
  const { t } = useTranslation()
  const inputID = useId()
  const [challenge, setChallenge] = useState<{ id: string; image: string }>()
  const [answer, setAnswer] = useState('')
  const [generation, setGeneration] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    setChallenge(undefined)
    setAnswer('')
    onChange({ captcha_id: '', captcha_answer: '' })
    void api
      .get('/api/auth/captcha', {
        params: { purpose },
        signal: controller.signal,
        timeout: 10000,
        disableDuplicate: true,
        skipAuthRefresh: true,
        skipErrorHandler: true,
      })
      .then((res) => {
        if (controller.signal.aborted) return
        if (!res.data?.success || !res.data.data?.image) {
          throw new Error('captcha')
        }
        setChallenge(res.data.data)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [purpose, onChange, generation])

  return (
    <div className='grid gap-2'>
      <Label htmlFor={inputID}>{t('Image verification code')}</Label>
      <div className='flex items-center gap-2'>
        <Input
          id={inputID}
          inputMode='numeric'
          autoComplete='off'
          maxLength={5}
          className='min-w-0 flex-1'
          value={answer}
          disabled={loading || !challenge}
          onChange={(event) => {
            const value = event.target.value.replaceAll(/\D/g, '').slice(0, 5)
            setAnswer(value)
            onChange({
              captcha_id: challenge?.id ?? '',
              captcha_answer: value,
            })
          }}
        />
        <div className='flex h-[60px] w-[150px] shrink-0 items-center justify-center rounded-sm bg-white'>
          {challenge && (
            <img
              src={challenge.image}
              width={150}
              height={50}
              alt={t('Verification code image')}
            />
          )}
          {loading && (
            <Loader2
              className='h-5 w-5 animate-spin'
              aria-label={t('Loading')}
            />
          )}
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          disabled={loading}
          title={t('Refresh verification code')}
          aria-label={t('Refresh verification code')}
          onClick={() => setGeneration((value) => value + 1)}
        >
          <RefreshCw className='h-4 w-4' />
        </Button>
      </div>
      {failed && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Could not load verification code. Please refresh it.')}
        </p>
      )}
    </div>
  )
}

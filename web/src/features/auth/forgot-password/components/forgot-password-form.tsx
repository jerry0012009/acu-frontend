import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { sendPasswordResetEmail } from '@/features/auth/api'
import {
  ImageCaptcha,
  type CaptchaAnswer,
} from '@/features/auth/components/image-captcha'
import {
  forgotPasswordFormSchema,
  PASSWORD_RESET_COUNTDOWN,
} from '@/features/auth/constants'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)

  const [captcha, setCaptcha] = useState<CaptchaAnswer>({
    captcha_id: '',
    captcha_answer: '',
  })
  const [captchaGeneration, setCaptchaGeneration] = useState(0)
  const {
    secondsLeft,
    isActive,
    start: startCountdown,
  } = useCountdown({ initialSeconds: PASSWORD_RESET_COUNTDOWN })

  const form = useForm<z.infer<typeof forgotPasswordFormSchema>>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
  })
  const captchaReady = Boolean(
    captcha.captcha_id && captcha.captcha_answer.length === 5
  )

  async function onSubmit(data: z.infer<typeof forgotPasswordFormSchema>) {
    if (!captchaReady) return

    setIsLoading(true)
    try {
      const res = await sendPasswordResetEmail(data.email, captcha)
      if (res?.success) {
        form.reset()
        startCountdown()
        toast.success(t('Reset email sent, please check your inbox'))
      } else {
        toast.error(res?.message || t('Failed to send reset email'))
      }
    } catch {
      // Errors are handled by global interceptor
    } finally {
      setIsLoading(false)
      setCaptchaGeneration((value) => value + 1)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-2', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ImageCaptcha
          key={captchaGeneration}
          purpose='reset-email'
          onChange={setCaptcha}
        />

        <Button
          type='submit'
          className='mt-2'
          disabled={isLoading || isActive || !captchaReady}
        >
          {isActive
            ? t('Resend ({{seconds}}s)', { seconds: secondsLeft })
            : t('Send reset email')}
          {isLoading ? <Loader2 className='animate-spin' /> : <ArrowRight />}
        </Button>
      </form>
    </Form>
  )
}

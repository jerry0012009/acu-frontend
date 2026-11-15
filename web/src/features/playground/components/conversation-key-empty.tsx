import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function ConversationKeyEmpty() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const create = useMutation({
    mutationFn: async () =>
      api.post('/api/token/', {
        name: 'ACU Conversation',
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        model_limits_enabled: false,
        group: '',
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['media-options'] })
      void client.invalidateQueries({ queryKey: ['acu-conversation-options'] })
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <section className='flex flex-wrap items-center justify-between gap-3 border-b p-4'>
      <p className='text-sm'>{t('Create a key to use your account balance')}</p>
      <Button disabled={create.isPending} onClick={() => create.mutate()}>
        {t('Create conversation key')}
      </Button>
    </section>
  )
}

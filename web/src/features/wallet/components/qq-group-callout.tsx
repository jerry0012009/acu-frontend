import { MessagesSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'

export function QqGroupCallout() {
  const { t } = useTranslation()

  return (
    <aside
      className='border-border/70 bg-muted/25 flex items-center gap-2.5 rounded-lg border px-3 py-3 sm:px-4'
      aria-label={t('Community Support')}
    >
      <IconBadge tone='info' size='sm'>
        <MessagesSquare aria-hidden='true' />
      </IconBadge>
      <div className='min-w-0'>
        <p className='text-sm font-medium'>{t('Community Support')}</p>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t('QQ Group: 985621187')}
        </p>
      </div>
    </aside>
  )
}

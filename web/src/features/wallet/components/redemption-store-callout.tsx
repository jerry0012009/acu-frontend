import { ExternalLink, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'

interface RedemptionStoreCalloutProps {
  purchaseUrl: string
}

export function RedemptionStoreCallout({
  purchaseUrl,
}: RedemptionStoreCalloutProps) {
  const { t } = useTranslation()

  return (
    <div className='border-border/70 bg-muted/25 flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4'>
      <div className='flex min-w-0 items-start gap-2.5'>
        <IconBadge tone='success' size='sm' className='mt-0.5'>
          <ShoppingBag aria-hidden='true' />
        </IconBadge>
        <div className='min-w-0 space-y-0.5'>
          <p className='text-sm font-medium'>{t('Buy a redemption code')}</p>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Purchase from the ACU store, then enter the code above to add funds.'
            )}
          </p>
        </div>
      </div>
      <Button
        variant='outline'
        size='sm'
        className='bg-background w-full shrink-0 gap-1.5 sm:w-auto'
        render={
          <a
            href={purchaseUrl}
            target='_blank'
            rel='noopener noreferrer'
            aria-label={t('Buy a redemption code (opens in a new tab)')}
          />
        }
      >
        {t('Buy now')}
        <ExternalLink aria-hidden='true' />
      </Button>
    </div>
  )
}

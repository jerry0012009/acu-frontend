import { ExternalLink, ShoppingBag } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { cn } from '@/lib/utils'

interface RedemptionStoreCalloutProps {
  purchaseUrl: string
}

export function RedemptionStoreCallout({
  purchaseUrl,
}: RedemptionStoreCalloutProps) {
  const { t } = useTranslation()
  let address: URL
  try {
    address = new URL(purchaseUrl)
  } catch {
    return null
  }
  if (address.protocol !== 'https:' || address.username || address.password) {
    return null
  }

  return (
    <div className='bg-muted/40 flex flex-col gap-3 rounded-lg px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4'>
      <div className='flex min-w-0 items-start gap-2.5'>
        <IconBadge tone='success' size='sm' className='mt-0.5'>
          <ShoppingBag aria-hidden='true' />
        </IconBadge>
        <div className='min-w-0 space-y-0.5'>
          <p className='text-sm font-semibold'>{t('Buy a redemption code')}</p>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t('Purchase in the ACU store, then return here and redeem it.')}
          </p>
        </div>
      </div>
      <a
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-9 w-full sm:w-auto'
        )}
        href={address.href}
        target='_blank'
        rel='noopener noreferrer'
        aria-label={t('Buy a redemption code (opens in a new tab)')}
      >
        {t('Open ACU store')}
        <ExternalLink aria-hidden='true' />
      </a>
    </div>
  )
}

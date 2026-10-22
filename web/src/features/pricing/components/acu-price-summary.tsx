import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { TOKEN_UNIT_DIVISORS } from '../constants'
import { formatACUCNY } from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'

export function ACUPriceSummary(props: {
  model: PricingModel
  tokenUnit: TokenUnit
}) {
  const { t } = useTranslation()
  const quote = props.model.acu_quote
  const price = props.model.payable
  if (quote?.status === 'loading') {
    return (
      <span
        role='status'
        aria-busy='true'
        className='text-muted-foreground text-xs'
      >
        {t('Updating price')}
      </span>
    )
  }
  if (quote?.status === 'error') {
    return (
      <span role='status' className='text-muted-foreground text-xs'>
        {t('Unable to load current price')}
      </span>
    )
  }
  if (!price) {
    return (
      <span role='status' className='text-muted-foreground text-xs'>
        {t('Unavailable for current settings')}
      </span>
    )
  }
  const divisor = TOKEN_UNIT_DIVISORS[props.tokenUnit]
  const protocolLabels = {
    chat_completions: 'Chat',
    responses: 'Responses',
    messages: 'Messages',
  }
  const strategyLabels = {
    balanced: t('Balanced routing'),
    lowest_cost: t('Lowest cost routing'),
    low_latency: t('Low latency routing'),
    high_reliability: t('High reliability routing'),
  }
  return (
    <div className='min-w-0 space-y-1'>
      <div className='text-muted-foreground flex items-center gap-1 text-xs'>
        <span>{t('Current estimated unit price')}</span>
        <Tooltip>
          <TooltipTrigger
            type='button'
            aria-label={t('Pricing details')}
            className='inline-flex size-5 shrink-0 items-center justify-center'
          >
            <Info className='size-3.5' aria-hidden='true' />
          </TooltipTrigger>
          <TooltipContent className='max-w-80'>
            {t(
              'ACU automatically selects an available route by price, speed, and reliability. The lowest price is not guaranteed. Routing evaluation fees, when incurred, are additional.'
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className='flex flex-wrap gap-x-3 gap-y-1 text-sm'>
        <span>
          {t('Input')}{' '}
          <strong className='font-mono tabular-nums'>
            {formatACUCNY(price.input_cny_per_million / divisor)}
          </strong>
        </span>
        <span>
          {t('Output')}{' '}
          <strong className='font-mono tabular-nums'>
            {formatACUCNY(price.output_cny_per_million / divisor)}
          </strong>
        </span>
      </div>
      <div className='text-muted-foreground text-[11px]'>
        / {props.tokenUnit === 'K' ? '1K' : '1M'} tokens
      </div>
      {quote && (
        <p className='text-muted-foreground text-[11px] break-words'>
          {protocolLabels[quote.protocol]} ·{' '}
          {strategyLabels[quote.supply_strategy ?? 'balanced']} ·{' '}
          {t('{{count}} available routes', { count: quote.routes.length })}
        </p>
      )}
    </div>
  )
}

export function ACURouteDetails(props: {
  model: PricingModel
  tokenUnit: TokenUnit
}) {
  const { t } = useTranslation()
  const quote = props.model.acu_quote
  if (quote?.status !== 'ready' || !props.model.payable) return null
  const divisor = TOKEN_UNIT_DIVISORS[props.tokenUnit]
  const price = props.model.payable
  return (
    <div className='mt-4 space-y-3'>
      <div className='max-w-full overflow-x-auto'>
        <table className='w-full min-w-[340px] text-left text-xs'>
          <caption className='text-muted-foreground mb-2 text-left'>
            {t('Available routes')} ·{' '}
            {t('Price per {{unit}} tokens', {
              unit: props.tokenUnit === 'K' ? '1K' : '1M',
            })}
          </caption>
          <thead className='text-muted-foreground border-b'>
            <tr>
              <th scope='col' className='py-2 pr-3 font-medium'>
                {t('Route')}
              </th>
              <th scope='col' className='py-2 pr-3 font-medium'>
                {t('Input')}
              </th>
              <th scope='col' className='py-2 pr-3 font-medium'>
                {t('Output')}
              </th>
              <th scope='col' className='py-2 font-medium'>
                {t('Status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {quote.routes.map((route) => (
              <tr key={route.id} className='border-b last:border-0'>
                <th
                  scope='row'
                  className='max-w-40 py-2 pr-3 font-normal break-words'
                >
                  {route.display_name}
                </th>
                <td className='py-2 pr-3 font-mono tabular-nums'>
                  {formatACUCNY(route.payable.input_cny_per_million / divisor)}
                </td>
                <td className='py-2 pr-3 font-mono tabular-nums'>
                  {formatACUCNY(route.payable.output_cny_per_million / divisor)}
                </td>
                <td className='py-2'>
                  {route.selected
                    ? t('Currently estimated selection')
                    : t('Available')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {price.cached_input_cny_per_million != null && (
        <p className='text-muted-foreground text-xs'>
          {t('Cached input')}:{' '}
          {formatACUCNY(price.cached_input_cny_per_million / divisor)} /{' '}
          {props.tokenUnit === 'K' ? '1K' : '1M'} tokens
        </p>
      )}
      {price.cache_write_cny_per_million != null && (
        <p className='text-muted-foreground text-xs'>
          {t('Cache write')}:{' '}
          {formatACUCNY(price.cache_write_cny_per_million / divisor)} /{' '}
          {props.tokenUnit === 'K' ? '1K' : '1M'} tokens
        </p>
      )}
      {price.context_tiers && (
        <p className='text-muted-foreground text-xs'>
          {t('Long-context pricing applies above {{count}} input tokens.', {
            count: price.context_tiers.thresholdTokens,
          })}
        </p>
      )}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Final charges use the executed route and actual usage. Routing evaluation fees, when incurred, are additional.'
        )}
      </p>
      {quote.generated_at && (
        <p className='text-muted-foreground text-xs'>
          {t('Updated')}:{' '}
          <time dateTime={quote.generated_at}>
            {new Date(quote.generated_at).toLocaleString()}
          </time>
        </p>
      )}
    </div>
  )
}

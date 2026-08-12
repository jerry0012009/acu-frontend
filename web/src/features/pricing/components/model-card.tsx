import { ChevronRight, Copy, Info } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
  isDynamicPricingModel,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import { isTokenBasedModel } from '../lib/model-helpers'
import {
  formatACUCNY,
  formatPrice,
  formatPublicReferenceSource,
  formatRequestPrice,
} from '../lib/price'
import type {
  PricingDisplayMode,
  PricingModel,
  PricingPayable,
  PricingReference,
  TokenUnit,
} from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelPerfBadge, type ModelPerfBadgeData } from './model-perf-badge'

export interface ModelCardProps {
  model: PricingModel
  onClick: () => void
  priceRate?: number
  usdExchangeRate?: number
  tokenUnit?: TokenUnit
  showRechargePrice?: boolean
  selectedGroup?: string
  perf?: ModelPerfBadgeData
  pricingDisplayMode: PricingDisplayMode
}

function ACUPricingTooltip(props: {
  payable?: PricingPayable
  reference?: PricingReference
}) {
  const { t } = useTranslation()
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          type='button'
          aria-label={t('Pricing details')}
          className='text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-sm'
        >
          <Info className='size-3.5' />
        </TooltipTrigger>
        <TooltipContent className='block max-w-80 space-y-3 p-3 leading-relaxed'>
          {props.payable && (
            <div>
              <p className='font-semibold'>{t('Current platform estimate')}</p>
              <p>
                {t('Input')}:{' '}
                {formatACUCNY(props.payable.input_cny_per_million)} / 1M Tokens
              </p>
              <p>
                {t('Output')}:{' '}
                {formatACUCNY(props.payable.output_cny_per_million)} / 1M Tokens
              </p>
              {props.payable.cached_input_cny_per_million !== undefined && (
                <p>
                  {t('Cached')}:{' '}
                  {formatACUCNY(props.payable.cached_input_cny_per_million)} /
                  1M Tokens
                </p>
              )}
              {props.payable.status === 'estimated' && (
                <p>
                  {t('Price status')}: {t('Estimated')}
                </p>
              )}
            </div>
          )}
          {props.reference ? (
            <div>
              <p className='font-semibold'>
                {t('Official or public reference')}
              </p>
              <p>
                {t('Input')}:{' '}
                {formatACUCNY(props.reference.input_cny_per_million)} / 1M
                Tokens
              </p>
              <p>
                {t('Output')}:{' '}
                {formatACUCNY(props.reference.output_cny_per_million)} / 1M
                Tokens
              </p>
              {props.reference.cached_input_cny_per_million !== undefined && (
                <p>
                  {t('Cached')}:{' '}
                  {formatACUCNY(props.reference.cached_input_cny_per_million)} /
                  1M Tokens
                </p>
              )}
              <p>
                {t('Reference source')}:{' '}
                {formatPublicReferenceSource(
                  props.reference,
                  t('Official pricing'),
                  t('OpenRouter public pricing')
                )}
              </p>
              <p>
                {t('Updated')}: {props.reference.observed_at}
              </p>
            </div>
          ) : (
            <p>{t('No comparable public reference price')}</p>
          )}
          <p className='border-background/20 border-t pt-2 opacity-80'>
            {t(
              'Actual payment may change with route availability, network status, and price updates. Final billing prevails.'
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export const ModelCard = memo(function ModelCard(props: ModelCardProps) {
  const { t } = useTranslation()
  const { copyToClipboard } = useCopyToClipboard()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1
  const showRechargePrice = props.showRechargePrice ?? false
  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'
  const tags = parseTags(props.model.tags)
  const groups = props.model.enable_groups || []
  const endpoints = props.model.supported_endpoint_types || []
  const modelIconKey = props.model.icon || props.model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 28) : null
  const displayName = props.model.display_name || props.model.model_name
  const initial = displayName?.charAt(0).toUpperCase() || '?'
  const isDynamicPricing = isDynamicPricingModel(props.model)
  const hasCachedPrice = isTokenBased && props.model.cache_ratio != null
  const dynamicSummary = isDynamicPricing
    ? getDynamicPricingSummary(props.model, {
        tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        groupRatioMultiplier: getDynamicDisplayGroupRatio(
          props.model,
          props.selectedGroup
        ),
      })
    : null

  const primaryGroup = groups[0]
  const bottomTags = [...endpoints.slice(0, 2), ...tags.slice(0, 2)]
  const hiddenCount =
    Math.max(groups.length - 1, 0) +
    Math.max(endpoints.length - 2, 0) +
    Math.max(tags.length - 2, 0)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(props.model.model_name || '')
  }

  let priceSummary: ReactNode
  if (props.model.billing_mode === 'acu_dynamic') {
    priceSummary = (
      <span className='text-muted-foreground text-sm'>
        {props.model.pricing_label || t('Dynamic Pricing')}
      </span>
    )
  } else if (props.model.payable) {
    const displayed = props.model.payable
    priceSummary = (
      <div className='flex min-w-0 flex-col gap-1'>
        <div className='text-muted-foreground flex items-center gap-1 text-xs font-medium'>
          {t('Current routed estimate')}
          <ACUPricingTooltip
            payable={props.model.payable}
            reference={props.model.reference}
          />
        </div>
        <div className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5'>
          <span>
            {t('Input')}{' '}
            <strong className='font-mono'>
              {formatACUCNY(displayed.input_cny_per_million)}
            </strong>
          </span>
          <span>
            {t('Output')}{' '}
            <strong className='font-mono'>
              {formatACUCNY(displayed.output_cny_per_million)}
            </strong>
          </span>
          {displayed.cached_input_cny_per_million !== undefined && (
            <span>
              {t('Cached')}{' '}
              <strong className='font-mono'>
                {formatACUCNY(displayed.cached_input_cny_per_million)}
              </strong>
            </span>
          )}
        </div>
      </div>
    )
  } else if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      priceSummary = (
        <span className='min-w-0'>
          <span className='text-amber-700 dark:text-amber-300'>
            {t('Special billing expression')}
          </span>
          <code className='text-muted-foreground/70 mt-0.5 line-clamp-1 block font-mono text-[11px] break-all'>
            {dynamicSummary.rawExpression}
          </code>
        </span>
      )
    } else if (dynamicSummary.primaryEntries.length > 0) {
      priceSummary = (
        <>
          {dynamicSummary.primaryEntries.map((entry) => (
            <span
              key={entry.key}
              className='text-muted-foreground whitespace-nowrap'
            >
              {t(entry.shortLabel)}{' '}
              <span className='text-foreground font-mono font-semibold'>
                {entry.formatted}
              </span>
            </span>
          ))}
        </>
      )
    } else {
      priceSummary = (
        <span className='text-muted-foreground text-sm'>
          {props.model.pricing_label || t('Dynamic Pricing')}
        </span>
      )
    }
  } else if (isTokenBased) {
    priceSummary = (
      <>
        <span className='text-muted-foreground whitespace-nowrap'>
          {t('Input')}{' '}
          <span className='text-foreground font-mono font-semibold'>
            {formatPrice(
              props.model,
              'input',
              tokenUnit,
              showRechargePrice,
              priceRate,
              usdExchangeRate,
              props.selectedGroup
            )}
          </span>
        </span>
        <span className='text-muted-foreground whitespace-nowrap'>
          {t('Output')}{' '}
          <span className='text-foreground font-mono font-semibold'>
            {formatPrice(
              props.model,
              'output',
              tokenUnit,
              showRechargePrice,
              priceRate,
              usdExchangeRate,
              props.selectedGroup
            )}
          </span>
        </span>
        {hasCachedPrice && (
          <span className='text-muted-foreground whitespace-nowrap'>
            {t('Cached')}{' '}
            <span className='text-foreground font-mono font-semibold'>
              {formatPrice(
                props.model,
                'cache',
                tokenUnit,
                showRechargePrice,
                priceRate,
                usdExchangeRate,
                props.selectedGroup
              )}
            </span>
          </span>
        )}
      </>
    )
  } else {
    priceSummary = (
      <span className='text-muted-foreground whitespace-nowrap'>
        <span className='text-foreground font-mono font-semibold'>
          {formatRequestPrice(
            props.model,
            showRechargePrice,
            priceRate,
            usdExchangeRate,
            props.selectedGroup
          )}
        </span>{' '}
        / {t('request')}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col rounded-xl border p-3 transition-colors sm:p-5',
        'hover:bg-muted/20'
      )}
    >
      {/* Header: icon + name + price + actions */}
      <div className='flex items-start justify-between gap-2.5 sm:gap-3'>
        <div className='flex min-w-0 items-start gap-2.5 sm:gap-3'>
          <div className='bg-muted/40 flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10 sm:rounded-xl'>
            {modelIcon || (
              <span className='text-muted-foreground text-sm font-bold'>
                {initial}
              </span>
            )}
          </div>
          <div className='min-w-0'>
            <h3 className='text-foreground truncate font-mono text-[15px] leading-tight font-bold'>
              {displayName}
            </h3>
            {props.model.display_name && (
              <div className='text-muted-foreground truncate font-mono text-[11px]'>
                {props.model.model_name}
              </div>
            )}
            <div className='mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm sm:mt-1 sm:gap-x-3'>
              {priceSummary}
            </div>
          </div>
        </div>

        <div className='flex shrink-0 items-center gap-1.5'>
          <button
            type='button'
            onClick={props.onClick}
            className='text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors sm:px-2.5 sm:py-1.5'
          >
            {t('Details')}
            <ChevronRight className='size-3.5' />
          </button>
          <button
            type='button'
            onClick={handleCopy}
            className='text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border p-1.5 transition-colors'
            title={t('Copy')}
          >
            <Copy className='size-3.5' />
          </button>
        </div>
      </div>

      {/* Description */}
      <p className='text-muted-foreground mt-2 line-clamp-1 flex-1 text-[13px] leading-relaxed sm:mt-4 sm:line-clamp-2 sm:min-h-[2.5rem]'>
        {props.model.description || t('No description available.')}
      </p>

      <div className='mt-auto flex flex-col gap-2 pt-4'>
        <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
          {primaryGroup && (
            <span className='text-muted-foreground text-sm font-medium'>
              {primaryGroup}
            </span>
          )}
          <ModelBillingModeBadge model={props.model} />
          <ModelPerfBadge perf={props.perf} />
        </div>

        <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
          {bottomTags.map((item) => (
            <span key={item} className='text-muted-foreground/70 text-xs'>
              {item}
            </span>
          ))}
          <span className='text-muted-foreground/50 text-xs'>
            {tokenUnitLabel}
          </span>
          {hiddenCount > 0 && (
            <span className='text-muted-foreground/40 text-xs'>
              +{hiddenCount}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { ACUExecutionProfileProbeResult } from '../api'
import { recommendedProbeMultiplier } from './acu-probe-reconciliation'

export type ACUProbePriceDraft = {
  inputPricePerMillion?: number
  outputPricePerMillion?: number
  cachedInputPricePerMillion?: number
  cacheWritePricePerMillion?: number
}

function displayPrice(value: number | undefined) {
  return value === undefined ? 'n/a' : `$${value} / 1M`
}

function numberField(
  result: ACUExecutionProfileProbeResult,
  field: string
): number | undefined {
  const value = Number(result.costBreakdown[field])
  return Number.isFinite(value) ? value : undefined
}

export function ACUProbeResultPanel(props: {
  result: ACUExecutionProfileProbeResult
  price?: ACUProbePriceDraft
  currentMultiplier?: number
  creditsPerCny?: number
  actualDebit?: string
  onActualDebitChange?: (value: string) => void
  onUseRecommended?: (value: number) => void
  showCalibration?: boolean
  calibrationMultiplier?: string
  calibrationCreditsPerCny?: string
  onCalibrationMultiplierChange?: (value: string) => void
  onCalibrationCreditsPerCnyChange?: (value: string) => void
  onSaveCalibration?: () => void
  savePending?: boolean
  saveMessage?: string
}) {
  const { t } = useTranslation()
  const nominal = numberField(props.result, 'catalogNominalCostUsd')
  const recommended = recommendedProbeMultiplier(nominal, props.actualDebit)
  const currentMultiplier =
    props.currentMultiplier ??
    numberField(props.result, 'billingMultiplier') ??
    0
  const providerCreditCashCostCny = numberField(
    props.result,
    'providerCreditCashCostCny'
  )
  const creditsPerCny =
    props.creditsPerCny ??
    (providerCreditCashCostCny !== undefined && providerCreditCashCostCny > 0
      ? 1 / providerCreditCashCostCny
      : undefined)
  const estimatedPlatformDebit =
    nominal === undefined ? undefined : nominal * currentMultiplier
  const estimatedCny =
    estimatedPlatformDebit !== undefined &&
    creditsPerCny !== undefined &&
    creditsPerCny > 0
      ? estimatedPlatformDebit / creditsPerCny
      : undefined
  const canReconcile =
    props.result.success &&
    props.result.usageTrusted &&
    nominal !== undefined &&
    nominal > 0

  return (
    <div className='space-y-2 rounded border p-2 text-[11px]'>
      <div
        className={props.result.success ? 'text-green-700' : 'text-destructive'}
      >
        {props.result.success ? t('Probe passed') : t('Probe failed')} · HTTP{' '}
        {props.result.httpStatus ?? 'n/a'} · {props.result.latencyMs ?? 'n/a'}{' '}
        ms
      </div>
      <div className='text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1'>
        <span>{t('Provider')}</span>
        <span>{props.result.provider}</span>
        <span>{t('Channel')}</span>
        <span>{props.result.channel}</span>
        <span>{t('Requested model')}</span>
        <span className='break-all'>{props.result.requestedModel}</span>
        <span>{t('Model')}</span>
        <span className='break-all'>
          {props.result.actualModel ?? props.result.requestedModel}
        </span>
        <span>{t('First event latency')}</span>
        <span>
          {props.result.firstEventLatencyMs === null
            ? 'n/a'
            : `${props.result.firstEventLatencyMs} ms`}
        </span>
        <span>{t('Usage')}</span>
        <span>
          {props.result.usageTrusted ? t('verified') : t('untrusted')}
        </span>
        <span>{t('Input price / 1M')}</span>
        <span>{displayPrice(props.price?.inputPricePerMillion)}</span>
        <span>{t('Output price / 1M')}</span>
        <span>{displayPrice(props.price?.outputPricePerMillion)}</span>
        <span>{t('Cached input price / 1M')}</span>
        <span>{displayPrice(props.price?.cachedInputPricePerMillion)}</span>
        <span>{t('Cache write price / 1M')}</span>
        <span>{displayPrice(props.price?.cacheWritePricePerMillion)}</span>
        <span>{t('Input tokens')}</span>
        <span>{props.result.inputTokens}</span>
        <span>{t('Cached input tokens')}</span>
        <span>{props.result.cachedInputTokens}</span>
        <span>{t('Cache creation tokens')}</span>
        <span>{props.result.cacheCreationInputTokens}</span>
        <span>{t('Output tokens')}</span>
        <span>{props.result.outputTokens}</span>
        <span>{t('Reasoning tokens')}</span>
        <span>{props.result.reasoningTokens}</span>
        <span>{t('Input accounting')}</span>
        <span>
          {props.result.inputTokenAccountingMode === 'includes_cached'
            ? t('Total input includes cached tokens')
            : t('Input excludes cached tokens')}
        </span>
        <span>{t('Probe cost CNY')}</span>
        <span>{props.result.costCny.toFixed(8)}</span>
      </div>
      {!props.result.success && (
        <div className='space-y-1 border-t pt-2'>
          <div>
            <span className='text-muted-foreground'>{t('Error class')}: </span>
            {props.result.errorClass || t('unknown')}
          </div>
          {props.result.errorDetail ? (
            <pre className='bg-muted max-h-56 overflow-auto rounded p-2 text-[10px] whitespace-pre-wrap'>
              {props.result.errorDetail}
            </pre>
          ) : null}
        </div>
      )}
      {canReconcile && (
        <div className='space-y-2 border-t pt-2'>
          <div className='font-medium'>{t('Cost reconciliation')}</div>
          <div className='text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1'>
            <span>{t('Nominal model cost USD')}</span>
            <span>{nominal.toFixed(8)}</span>
            <span>{t('Current billing multiplier')}</span>
            <span>{currentMultiplier.toFixed(4)}x</span>
            <span>{t('Estimated platform debit')}</span>
            <span>
              {estimatedPlatformDebit === undefined
                ? 'n/a'
                : `${estimatedPlatformDebit.toFixed(8)} credits`}
            </span>
            <span>{t('Credits per CNY')}</span>
            <span>
              {creditsPerCny === undefined
                ? 'n/a'
                : `1 RMB = ${creditsPerCny} credits`}
            </span>
            <span>{t('Estimated CNY cost')}</span>
            <span>
              {estimatedCny === undefined
                ? 'n/a'
                : `¥${estimatedCny.toFixed(8)}`}
            </span>
          </div>
          {props.onActualDebitChange && props.onUseRecommended ? (
            <div className='grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end'>
              <label className='space-y-1'>
                <span className='text-muted-foreground'>
                  {t('Actual platform debit (USD credits)')}
                </span>
                <input
                  className='bg-background h-8 w-full rounded border px-2'
                  type='number'
                  min='0'
                  step='0.00000001'
                  value={props.actualDebit ?? ''}
                  onChange={(event) =>
                    props.onActualDebitChange?.(event.target.value)
                  }
                />
              </label>
              <div className='text-muted-foreground'>
                {recommended === undefined
                  ? t('Recommended multiplier unavailable')
                  : `${t('Recommended multiplier')}: ${recommended.toFixed(4)}x`}
                {recommended !== undefined && (
                  <Button
                    size='sm'
                    variant='ghost'
                    className='ml-1'
                    onClick={() => props.onUseRecommended?.(recommended)}
                  >
                    {t('Use')}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
          {props.showCalibration ? (
            <div className='space-y-2 border-t pt-2'>
              <label className='block space-y-1'>
                <span className='text-muted-foreground'>
                  {t('Profile billing multiplier')}
                </span>
                <input
                  className='bg-background h-8 w-full rounded border px-2'
                  type='number'
                  min='0.000001'
                  step='0.0001'
                  value={props.calibrationMultiplier ?? ''}
                  onChange={(event) =>
                    props.onCalibrationMultiplierChange?.(event.target.value)
                  }
                />
              </label>
              <label className='block space-y-1'>
                <span className='text-muted-foreground'>
                  {t('Provider conversion')}
                </span>
                <input
                  className='bg-background h-8 w-full rounded border px-2'
                  type='number'
                  min='0.000001'
                  step='0.01'
                  value={props.calibrationCreditsPerCny ?? ''}
                  onChange={(event) =>
                    props.onCalibrationCreditsPerCnyChange?.(event.target.value)
                  }
                />
                <span className='text-muted-foreground block'>
                  {t(
                    'Provider-level value; affects profiles sharing this provider economics.'
                  )}
                </span>
              </label>
              <Button
                size='sm'
                disabled={props.savePending}
                onClick={props.onSaveCalibration}
              >
                {props.savePending ? t('Saving') : t('Save calibration')}
              </Button>
              {props.saveMessage ? (
                <span className='text-muted-foreground ml-2'>
                  {props.saveMessage}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'
import { formatMultiplier } from '@/lib/format'

import type {
  ACUChannelMonitorProfile,
  ACUTokenProfileRoutingScope,
} from '../api'
import {
  modelProfilePriceRange,
  previewModelPriceRange,
} from './acu-monitor-presentation'

const priceRangeSchema = z
  .object({
    minimum: z
      .string()
      .trim()
      .min(1)
      .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0),
    maximum: z
      .string()
      .trim()
      .min(1)
      .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0),
  })
  .refine((value) => Number(value.minimum) <= Number(value.maximum))

export function ACUModelPriceRange(props: {
  modelId: string
  profiles: ACUChannelMonitorProfile[]
  scope: ACUTokenProfileRoutingScope
  scenario?: string
  pending: boolean
  onApply: (
    modelId: string,
    states: Record<string, boolean>
  ) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const currentRange = modelProfilePriceRange(
    props.profiles,
    props.scope.effectiveProfileIds
  )
  const availableRange = modelProfilePriceRange(
    props.profiles,
    props.scope.globalProfileIds
  )
  const initialRange = currentRange ?? availableRange
  const form = useForm({
    resolver: zodResolver(priceRangeSchema),
    defaultValues: {
      minimum: initialRange == null ? '' : String(initialRange.minimum),
      maximum: initialRange == null ? '' : String(initialRange.maximum),
    },
  })
  const values = form.watch()
  const valid = priceRangeSchema.safeParse(values).success
  const preview = previewModelPriceRange(
    props.profiles,
    props.scope,
    Number(values.minimum),
    Number(values.maximum)
  )
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const pending = props.pending || form.formState.isSubmitting
  const enableCount = preview.changes.filter((change) => change.enabled).length
  const disableCount = preview.changes.length - enableCount
  return (
    <form
      className='space-y-2'
      aria-label={t('Price factor range')}
      onChange={() => {
        setSaved(false)
        setError('')
      }}
      onSubmit={form.handleSubmit(async () => {
        if (pending || !preview.matched || !preview.changes.length) return
        if (
          !window.confirm(
            t(
              'Apply this selection to {{model}} for the current API key? Enable {{enabled}}, disable {{disabled}}.',
              {
                model: props.modelId,
                enabled: enableCount,
                disabled: disableCount,
              }
            )
          )
        ) {
          return
        }
        setError('')
        setSaved(false)
        try {
          await props.onApply(props.modelId, preview.states)
          setSaved(true)
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : t('API key routing update failed')
          )
        }
      })}
    >
      <dl className='flex flex-wrap gap-x-6 gap-y-2 text-xs'>
        <div>
          <dt className='text-muted-foreground'>
            {t('Current API key factor range')}
          </dt>
          <dd className='mt-1 font-medium tabular-nums'>
            {currentRange == null
              ? t('No priced Profiles enabled')
              : `${formatMultiplier(currentRange.minimum, '×')} ~ ${formatMultiplier(currentRange.maximum, '×')}`}
          </dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>
            {t('Selectable factor range')}
          </dt>
          <dd className='mt-1 font-medium tabular-nums'>
            {availableRange == null
              ? t('No price data')
              : `${formatMultiplier(availableRange.minimum, '×')} ~ ${formatMultiplier(availableRange.maximum, '×')}`}
          </dd>
        </div>
      </dl>
      <div className='flex flex-wrap items-end gap-3'>
        <span className='self-center text-xs font-medium'>
          {t('Price factor range')}
        </span>
        <label className='min-w-0 text-xs'>
          <span className='text-muted-foreground mb-1 block'>
            {t('Minimum factor')}
          </span>
          <div className='flex items-center gap-1'>
            <input
              className='bg-background h-8 w-24 rounded border px-2 tabular-nums'
              type='number'
              min={0}
              step='any'
              aria-label={t('Minimum factor')}
              disabled={pending}
              {...form.register('minimum')}
            />
            <span>×</span>
          </div>
        </label>
        <label className='min-w-0 text-xs'>
          <span className='text-muted-foreground mb-1 block'>
            {t('Maximum factor')}
          </span>
          <div className='flex items-center gap-1'>
            <input
              className='bg-background h-8 w-24 rounded border px-2 tabular-nums'
              type='number'
              min={0}
              step='any'
              aria-label={t('Maximum factor')}
              disabled={pending}
              {...form.register('maximum')}
            />
            <span>×</span>
          </div>
        </label>
        <Button
          size='sm'
          type='submit'
          disabled={
            pending || !valid || !preview.matched || !preview.changes.length
          }
        >
          <Check className='size-3.5' />
          {pending ? t('Saving...') : t('Apply once')}
        </Button>
        {props.scenario && (
          <span className='text-muted-foreground self-center text-xs'>
            {t('Request size')}: {props.scenario}
          </span>
        )}
      </div>
      {!valid ? (
        <p role='alert' className='text-destructive text-xs'>
          {t('Enter a valid factor range with minimum no greater than maximum')}
        </p>
      ) : (
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs'>
          <span>
            {t('{{count}} matching Profiles', { count: preview.matched })}
          </span>
          <span>
            {t('Enable {{enabled}}, disable {{disabled}}', {
              enabled: enableCount,
              disabled: disableCount,
            })}
          </span>
          {preview.unknown > 0 && (
            <span className='text-muted-foreground'>
              {t('Unknown price: {{count}} excluded', {
                count: preview.unknown,
              })}
            </span>
          )}
        </div>
      )}
      {valid && preview.changes.length > 0 && (
        <details className='text-xs'>
          <summary className='text-muted-foreground w-fit cursor-pointer'>
            {t('Pending changes')} ({preview.changes.length})
          </summary>
          <ul className='mt-2 max-h-40 space-y-1 overflow-y-auto'>
            {preview.changes.map((change) => (
              <li
                key={change.profile.executionProfileId}
                className='flex min-w-0 gap-2'
              >
                <span className='shrink-0'>
                  {change.enabled ? t('Enable') : t('Disable')}
                </span>
                <span className='min-w-0 break-words'>
                  {publicChannelAlias(
                    change.profile.provider,
                    change.profile.channel
                  )}
                  {change.profile.publicNote
                    ? ` · ${change.profile.publicNote}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role='alert' className='text-destructive text-xs'>
          {error}
        </p>
      )}
      {saved && preview.changes.length === 0 && (
        <p role='status' className='text-xs'>
          {t('Selection saved')}
        </p>
      )}
    </form>
  )
}

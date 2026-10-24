import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'

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

function formatFactor(value: number): string {
  return `${value === 0 ? '0' : value.toPrecision(3)}×`
}

// Outward rounding keeps a prefilled range from excluding a route at its edge.
function formatFactorBound(
  value: number,
  bound: 'minimum' | 'maximum'
): string {
  if (value === 0) return '0'
  const scale = 10 ** (2 - Math.floor(Math.log10(value)))
  if (!Number.isFinite(scale)) return String(value)
  const scaled = value * scale
  const rounded = bound === 'minimum' ? Math.floor(scaled) : Math.ceil(scaled)
  return (rounded / scale).toPrecision(3)
}

export function ACUModelPriceRange(props: {
  modelId: string
  profiles: ACUChannelMonitorProfile[]
  scope: Pick<
    ACUTokenProfileRoutingScope,
    'globalProfileIds' | 'effectiveProfileIds'
  >
  isAdmin: boolean
  pending: boolean
  targetLabel: string
  currentRangeLabel?: string
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
      minimum:
        initialRange == null
          ? ''
          : formatFactorBound(initialRange.minimum, 'minimum'),
      maximum:
        initialRange == null
          ? ''
          : formatFactorBound(initialRange.maximum, 'maximum'),
    },
  })
  // react-hook-form's watch subscription drives these derived previews.
  // oxlint-disable-next-line react(incompatible-library)
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const pending = props.pending || saving
  const enableCount = preview.changes.filter((change) => change.enabled).length
  const disableCount = preview.changes.length - enableCount
  const applySelection = async () => {
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await props.onApply(props.modelId, preview.states)
      setSaved(true)
      setConfirmOpen(false)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('API key routing update failed')
      )
    } finally {
      setSaving(false)
    }
  }
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
        setError('')
        setSaved(false)
        setConfirmOpen(true)
      })}
    >
      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-xs'>
        <div className='flex min-w-0 flex-wrap items-center gap-x-1'>
          <span className='text-muted-foreground'>
            {t(props.currentRangeLabel ?? 'Current API key factor range')}
          </span>
          <span className='font-medium tabular-nums'>
            {currentRange == null
              ? t('No priced Profiles enabled')
              : `${formatFactor(currentRange.minimum)} ~ ${formatFactor(currentRange.maximum)}`}
          </span>
        </div>
        <div className='flex min-w-0 flex-wrap items-center gap-x-1'>
          <span className='text-muted-foreground'>
            {t('Selectable factor range')}
          </span>
          <span className='font-medium tabular-nums'>
            {availableRange == null
              ? t('No price data')
              : `${formatFactor(availableRange.minimum)} ~ ${formatFactor(availableRange.maximum)}`}
          </span>
        </div>
        <label className='flex items-center gap-1 whitespace-nowrap'>
          <span className='text-muted-foreground'>{t('Minimum factor')}</span>
          <input
            className='bg-background h-8 w-20 rounded border px-2 tabular-nums'
            type='text'
            inputMode='decimal'
            aria-label={t('Minimum factor')}
            disabled={pending}
            {...form.register('minimum')}
          />
          <span>×</span>
        </label>
        <label className='flex items-center gap-1 whitespace-nowrap'>
          <span className='text-muted-foreground'>{t('Maximum factor')}</span>
          <input
            className='bg-background h-8 w-20 rounded border px-2 tabular-nums'
            type='text'
            inputMode='decimal'
            aria-label={t('Maximum factor')}
            disabled={pending}
            {...form.register('maximum')}
          />
          <span>×</span>
        </label>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <span>
            {t('{{count}} matching Profiles', { count: preview.matched })}
          </span>
          <span className='text-muted-foreground'>
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
      </div>
      {!valid && (
        <p role='alert' className='text-destructive text-xs'>
          {t('Enter a valid factor range with minimum no greater than maximum')}
        </p>
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
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className='max-h-[90vh] w-[min(46rem,calc(100%-1rem))] max-w-none overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{t('Apply price factor range')}</DialogTitle>
            <DialogDescription className='break-words'>
              {t('Apply this selection to {{model}} for {{target}}.', {
                model: props.modelId,
                target: t(props.targetLabel),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='text-xs'>
            {t('Enable {{enabled}}, disable {{disabled}}', {
              enabled: enableCount,
              disabled: disableCount,
            })}
          </div>
          <ul className='max-h-[50vh] space-y-2 overflow-y-auto rounded border p-2 text-xs'>
            {preview.changes.map((change) => (
              <li
                key={change.profile.executionProfileId}
                className='grid min-w-0 gap-x-3 gap-y-1 border-b pb-2 last:border-0 last:pb-0 sm:grid-cols-[5rem_minmax(8rem,1fr)_6rem_minmax(8rem,1fr)]'
              >
                <span className='font-medium'>
                  {change.enabled ? t('Enable') : t('Disable')}
                </span>
                <span className='min-w-0 break-words'>
                  {publicChannelAlias(
                    change.profile.provider,
                    change.profile.channel
                  )}
                  {props.isAdmin && (
                    <span className='text-muted-foreground block break-all'>
                      {t('Channel ID')}: {change.profile.channel}
                    </span>
                  )}
                </span>
                <span className='tabular-nums'>
                  {change.profile.effectivePriceMultiplier == null
                    ? t('No price data')
                    : formatFactor(change.profile.effectivePriceMultiplier)}
                </span>
                <span className='min-w-0 break-words'>
                  {change.profile.publicNote || t('No public note')}
                </span>
                {props.isAdmin && (
                  <span className='text-muted-foreground min-w-0 break-all sm:col-span-4'>
                    {t('Execution Profile ID')}:{' '}
                    {change.profile.executionProfileId}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {error && (
            <p role='alert' className='text-destructive text-xs'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={() => setConfirmOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              disabled={pending || !preview.changes.length}
              onClick={() => void applySelection()}
            >
              <Check className='size-3.5' />
              {saving ? t('Saving...') : t('Apply once')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

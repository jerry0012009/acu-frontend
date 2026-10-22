import { RotateCcw, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type {
  ACUChannelMonitorProfile,
  ACUTokenProfileRoutingScope,
} from '../api'

export function ACUTokenProfileWeight(props: {
  profile: ACUChannelMonitorProfile
  scope: ACUTokenProfileRoutingScope
  pending: boolean
  onSetWeight: (
    profile: ACUChannelMonitorProfile,
    weight: number
  ) => void | Promise<unknown>
  onInheritWeight: (
    profile: ACUChannelMonitorProfile
  ) => void | Promise<unknown>
}) {
  const { t } = useTranslation()
  const id = props.profile.executionProfileId
  const configured = props.scope.configuredWeights?.[id]
  const global =
    props.scope.globalWeights?.[id] ?? props.profile.routingWeight ?? 100
  const effective = props.scope.effectiveWeights?.[id] ?? configured ?? global
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const value = draft ?? String(effective)
  const save = async () => {
    const weight = Number(value)
    if (
      !value.trim() ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 500
    ) {
      setError(t('Profile weight must be from 0 to 500'))
      return
    }
    setError('')
    setSaved(false)
    try {
      await props.onSetWeight(props.profile, weight)
      setDraft(null)
      setSaved(true)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('API key routing update failed')
      )
    }
  }
  return (
    <form
      className='flex flex-wrap items-center gap-2 text-xs'
      onSubmit={(event) => {
        event.preventDefault()
        if (!props.pending) void save()
      }}
    >
      <label className='flex items-center gap-2'>
        <span>{t('Profile weight')}</span>
        <input
          aria-label={t('Profile weight')}
          className='bg-background h-8 w-20 rounded border px-2 tabular-nums'
          type='number'
          min={0}
          max={500}
          step={0.1}
          value={value}
          disabled={props.pending}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
            setError('')
          }}
        />
      </label>
      <Button
        size='icon-sm'
        variant='ghost'
        type='submit'
        title={t('Save weight')}
        aria-label={t('Save weight')}
        disabled={props.pending || draft === null}
      >
        <Save />
      </Button>
      <Button
        size='icon-sm'
        variant='ghost'
        type='button'
        title={t('Inherit global')}
        aria-label={t('Inherit global')}
        disabled={props.pending || configured === undefined}
        onClick={async () => {
          setError('')
          setSaved(false)
          try {
            await props.onInheritWeight(props.profile)
            setDraft(null)
            setSaved(true)
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : t('API key routing update failed')
            )
          }
        }}
      >
        <RotateCcw />
      </Button>
      <span className='text-muted-foreground'>
        {configured === undefined ? t('Inherited') : t('Custom')} ·{' '}
        {t('Global weight')}: {global}
      </span>
      {saved && (
        <span role='status' className='text-muted-foreground'>
          {t('Saved')}
        </span>
      )}
      {error && (
        <span role='alert' className='text-destructive w-full'>
          {error}
        </span>
      )}
    </form>
  )
}

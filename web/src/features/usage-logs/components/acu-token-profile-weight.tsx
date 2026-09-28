import { useEffect, useState } from 'react'
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
  onSetWeight: (profile: ACUChannelMonitorProfile, weight: number) => void
  onInheritWeight: (profile: ACUChannelMonitorProfile) => void
}) {
  const { t } = useTranslation()
  const profileId = props.profile.executionProfileId
  const configured = props.scope.configuredWeights?.[profileId]
  const globalWeight =
    props.scope.globalWeights?.[profileId] ?? props.profile.routingWeight ?? 100
  const effectiveWeight =
    props.scope.effectiveWeights?.[profileId] ?? configured ?? globalWeight
  const [value, setValue] = useState(String(configured ?? effectiveWeight))
  const [error, setError] = useState('')

  useEffect(() => {
    setValue(String(configured ?? effectiveWeight))
    setError('')
  }, [configured, effectiveWeight, profileId])

  const save = () => {
    const weight = Number(value)
    if (!Number.isFinite(weight) || weight < 0 || weight > 200) {
      setError(t('Profile weight must be from 0 to 200'))
      return
    }
    setError('')
    props.onSetWeight(props.profile, weight)
  }

  return (
    <div className='mt-2 flex flex-wrap items-end gap-2 text-[11px]'>
      <span className='text-muted-foreground'>
        {t('Global weight')}: {globalWeight}
      </span>
      <label className='space-y-1'>
        <span className='text-muted-foreground block'>
          {t('API key override')}
        </span>
        <input
          className='bg-background h-8 w-24 rounded border px-2'
          type='number'
          min={0}
          max={200}
          step={0.1}
          value={value}
          disabled={props.pending}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <span className='text-muted-foreground pb-2'>
        {t('Effective weight')}: {effectiveWeight}
      </span>
      <Button
        size='sm'
        variant='outline'
        disabled={props.pending}
        onClick={save}
      >
        {t('Save weight')}
      </Button>
      <Button
        size='sm'
        variant='ghost'
        disabled={props.pending || configured === undefined}
        onClick={() => props.onInheritWeight(props.profile)}
      >
        {t('Inherit global')}
      </Button>
      {error ? <span className='text-destructive'>{error}</span> : null}
    </div>
  )
}

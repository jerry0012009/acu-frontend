import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import {
  getACUExecutionProfiles,
  reconcileACUExecutionProfileCalibration,
} from '../api'

type Draft = {
  weight: string
  multiplier: string
  creditsPerCny: string
}

export function ACUMonitorQuickCalibration() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['acu-execution-profiles'],
    queryFn: getACUExecutionProfiles,
  })
  const data = query.data?.data
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Draft>({
    weight: '',
    multiplier: '',
    creditsPerCny: '',
  })
  const [error, setError] = useState('')
  const profiles = useMemo(
    () =>
      [...(data?.profiles ?? [])].sort((a, b) =>
        `${a.modelId} ${a.channel}`.localeCompare(`${b.modelId} ${b.channel}`)
      ),
    [data?.profiles]
  )
  const matchingProfiles = profiles.filter((profile) =>
    `${profile.modelId} ${profile.channel} ${profile.provider} ${profile.executionProfileId}`
      .toLowerCase()
      .includes(search.toLowerCase().trim())
  )
  useEffect(() => {
    if (!selectedId && profiles[0]) {
      setSelectedId(profiles[0].executionProfileId)
    }
  }, [profiles, selectedId])
  const selected = profiles.find(
    (profile) => profile.executionProfileId === selectedId
  )
  const providerId = selected?.economicsProviderId ?? selected?.provider
  const economics = data?.providerEconomics?.find(
    (item) => item.providerId === providerId
  )
  const initial: Draft = {
    weight: String(selected?.routingWeight ?? 100),
    multiplier: String(
      selected?.observedBillingMultiplier ??
        economics?.observedBillingMultiplier ??
        1
    ),
    creditsPerCny:
      economics?.creditsPerCny == null ? '' : String(economics.creditsPerCny),
  }
  useEffect(() => {
    setDraft(initial)
    setError('')
    // A new selection or saved server snapshot resets the edit form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedId,
    selected?.routingWeight,
    selected?.observedBillingMultiplier,
    economics?.observedBillingMultiplier,
    economics?.creditsPerCny,
  ])

  const weightChanged = selected && draft.weight !== initial.weight
  const multiplierChanged = selected && draft.multiplier !== initial.multiplier
  const conversionChanged =
    selected && draft.creditsPerCny !== initial.creditsPerCny
  const changed = weightChanged || multiplierChanged || conversionChanged
  const sharedCount = profiles.filter(
    (profile) =>
      (profile.economicsProviderId ?? profile.provider) === providerId
  ).length
  const mutation = useMutation({
    mutationFn: (input: {
      id: string
      values: {
        routingWeight?: number
        observedBillingMultiplier?: number
        creditsPerCny?: number
      }
    }) => reconcileACUExecutionProfileCalibration(input.id, input.values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['acu-execution-profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['acu-channel-monitor'] }),
        queryClient.invalidateQueries({
          queryKey: ['acu-token-profile-routing'],
        }),
        queryClient.invalidateQueries({ queryKey: ['pricing'] }),
      ])
      toast.success(t('Calibration saved'))
    },
    onError: (reason) =>
      setError(
        reason instanceof Error ? reason.message : t('Calibration failed')
      ),
  })

  const save = () => {
    if (!selected || !changed || mutation.isPending) return
    const weight = Number(draft.weight)
    const multiplier = Number(draft.multiplier)
    const conversion = Number(draft.creditsPerCny)
    if (
      (weightChanged &&
        (draft.weight.trim() === '' ||
          !Number.isFinite(weight) ||
          weight < 0 ||
          weight > 500)) ||
      (multiplierChanged &&
        (draft.multiplier.trim() === '' ||
          !Number.isFinite(multiplier) ||
          multiplier <= 0)) ||
      (conversionChanged &&
        (draft.creditsPerCny.trim() === '' ||
          !Number.isFinite(conversion) ||
          conversion <= 0))
    ) {
      setError(
        t('Enter valid positive values; Profile weight must be from 0 to 500')
      )
      return
    }
    if (
      conversionChanged &&
      sharedCount > 1 &&
      !window.confirm(
        t(
          'This conversion is shared by {{count}} Profiles. Save for all of them?',
          {
            count: sharedCount,
          }
        )
      )
    ) {
      return
    }
    setError('')
    mutation.mutate({
      id: selected.executionProfileId,
      values: {
        ...(weightChanged ? { routingWeight: weight } : {}),
        ...(multiplierChanged ? { observedBillingMultiplier: multiplier } : {}),
        ...(conversionChanged ? { creditsPerCny: conversion } : {}),
      },
    })
  }

  return (
    <section
      aria-label={t('Quick Profile configuration')}
      className='border-border bg-muted/20 min-w-0 space-y-3 border-y px-3 py-3 sm:px-4'
    >
      <div className='flex items-center gap-2'>
        <SlidersHorizontal
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
        <h3 className='text-sm font-semibold'>
          {t('Quick Profile configuration')}
        </h3>
      </div>
      {query.isError ? (
        <p role='alert' className='text-destructive text-xs'>
          {t('Profile configuration could not be loaded')}{' '}
          <Button
            size='sm'
            variant='outline'
            onClick={() => void query.refetch()}
          >
            {t('Retry')}
          </Button>
        </p>
      ) : (
        <>
          <div className='grid min-w-0 gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,2fr)]'>
            <label className='min-w-0 space-y-1 text-xs'>
              <span className='text-muted-foreground'>
                {t('Filter Profiles')}
              </span>
              <input
                type='search'
                className='bg-background h-9 w-full min-w-0 rounded-md border px-2.5 text-sm'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className='min-w-0 space-y-1 text-xs'>
              <span className='text-muted-foreground'>{t('Profile')}</span>
              <select
                className='bg-background h-9 w-full min-w-0 rounded-md border px-2.5 text-sm'
                value={selectedId}
                disabled={
                  query.isLoading || profiles.length === 0 || mutation.isPending
                }
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value=''>{t('Select a Profile')}</option>
                {matchingProfiles.map((profile) => (
                  <option
                    key={profile.executionProfileId}
                    value={profile.executionProfileId}
                  >
                    {profile.modelId} · {profile.channel} ·{' '}
                    {profile.executionProfileId}
                  </option>
                ))}
                {selected && !matchingProfiles.includes(selected) ? (
                  <option value={selectedId}>
                    {selected.modelId} · {selected.channel} ·{' '}
                    {selected.executionProfileId}
                  </option>
                ) : null}
              </select>
            </label>
          </div>
          {selected && (
            <div className='space-y-2 border-t pt-3'>
              <div className='text-muted-foreground min-w-0 text-xs break-all'>
                {selected.provider} / {selected.channel} ·{' '}
                {selected.executionProfileId}
              </div>
              <div className='grid gap-3 sm:grid-cols-3'>
                <CalibrationField
                  label={t('Global Profile weight')}
                  value={draft.weight}
                  min={0}
                  max={500}
                  step='0.1'
                  disabled={mutation.isPending}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, weight: value }))
                  }
                />
                <CalibrationField
                  label={t('Channel billing multiplier')}
                  value={draft.multiplier}
                  min={0.0001}
                  step='0.0001'
                  disabled={mutation.isPending}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, multiplier: value }))
                  }
                />
                <CalibrationField
                  label={t('Recharge conversion (credits per RMB)')}
                  value={draft.creditsPerCny}
                  min={0.000001}
                  step='0.000001'
                  disabled={mutation.isPending}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      creditsPerCny: value,
                    }))
                  }
                />
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='text-muted-foreground text-xs'>
                  {t(
                    'Conversion belongs to provider {{provider}} and affects {{count}} Profiles.',
                    {
                      provider: providerId,
                      count: sharedCount,
                    }
                  )}
                </span>
                <Button
                  size='sm'
                  disabled={!changed || mutation.isPending}
                  onClick={save}
                >
                  <Save className='size-3.5' aria-hidden='true' />
                  {t('Save configuration')}
                </Button>
              </div>
              {error && (
                <p role='alert' className='text-destructive text-xs'>
                  {error}
                </p>
              )}
            </div>
          )}
          {!query.isLoading && profiles.length === 0 && (
            <p className='text-muted-foreground text-xs'>
              {t('No model profiles')}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function CalibrationField(props: {
  label: string
  value: string
  min: number
  max?: number
  step: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className='min-w-0 space-y-1 text-xs'>
      <span className='text-muted-foreground'>{props.label}</span>
      <input
        className='bg-background h-9 w-full min-w-0 rounded-md border px-2.5 text-sm tabular-nums'
        type='number'
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

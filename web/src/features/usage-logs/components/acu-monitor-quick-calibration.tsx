import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
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
  const selectedProfiles = profiles.filter((profile) =>
    selectedIds.includes(profile.executionProfileId)
  )
  const selected =
    selectedProfiles.length === 1 ? selectedProfiles[0] : undefined
  const providerId = selected?.economicsProviderId ?? selected?.provider
  const economics = data?.providerEconomics?.find(
    (item) => item.providerId === providerId
  )
  const initial: Draft = {
    weight: selected ? String(selected.routingWeight ?? 100) : '',
    multiplier: selected
      ? String(
          selected.observedBillingMultiplier ??
            economics?.observedBillingMultiplier ??
            1
        )
      : '',
    creditsPerCny:
      economics?.creditsPerCny == null ? '' : String(economics.creditsPerCny),
  }
  const selectionKey = selectedIds.join('\0')
  useEffect(() => {
    setDraft(initial)
    setError('')
    // A changed selection begins a new draft; background refetches preserve edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  const bulk = selectedProfiles.length > 1
  const weightChanged =
    selectedProfiles.length > 0 &&
    (bulk ? draft.weight.trim() !== '' : draft.weight !== initial.weight)
  const multiplierChanged =
    selectedProfiles.length > 0 &&
    (bulk
      ? draft.multiplier.trim() !== ''
      : draft.multiplier !== initial.multiplier)
  const conversionChanged =
    selectedProfiles.length > 0 &&
    (bulk
      ? draft.creditsPerCny.trim() !== ''
      : draft.creditsPerCny !== initial.creditsPerCny)
  const changed = weightChanged || multiplierChanged || conversionChanged
  const affectedProviders = new Set(
    selectedProfiles.map(
      (profile) => profile.economicsProviderId ?? profile.provider
    )
  )
  const sharedCount = profiles.filter((profile) =>
    affectedProviders.has(profile.economicsProviderId ?? profile.provider)
  ).length
  const mutation = useMutation({
    mutationFn: async (input: {
      ids: string[]
      values: {
        routingWeight?: number
        observedBillingMultiplier?: number
        creditsPerCny?: number
      }
    }) => {
      const savedProviders = new Set<string>()
      const failed: string[] = []
      let saved = 0
      for (const id of input.ids) {
        const profile = profiles.find((item) => item.executionProfileId === id)
        if (!profile) continue
        const provider = profile.economicsProviderId ?? profile.provider
        const values = {
          ...input.values,
          ...(savedProviders.has(provider) ? { creditsPerCny: undefined } : {}),
        }
        if (Object.values(values).every((value) => value === undefined)) {
          continue
        }
        try {
          await reconcileACUExecutionProfileCalibration(id, values)
          saved++
          if (values.creditsPerCny !== undefined) savedProviders.add(provider)
        } catch (reason) {
          failed.push(
            `${id}: ${reason instanceof Error ? reason.message : t('Calibration failed')}`
          )
        }
      }
      return { saved, failed }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['acu-execution-profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['acu-channel-monitor'] }),
        queryClient.invalidateQueries({
          queryKey: ['acu-token-profile-routing'],
        }),
        queryClient.invalidateQueries({ queryKey: ['pricing'] }),
      ])
      if (result.failed.length > 0) {
        setError(
          `${t('{{saved}} saved; {{failed}} failed. Review and retry.', {
            saved: result.saved,
            failed: result.failed.length,
          })} ${result.failed.join('; ')}`
        )
        return
      }
      setError('')
      toast.success(
        result.saved === 1 && selectedProfiles.length > 1
          ? t('Calibration saved')
          : t('{{count}} Profiles updated', { count: result.saved })
      )
    },
    onError: (reason) =>
      setError(
        reason instanceof Error ? reason.message : t('Calibration failed')
      ),
  })

  const save = () => {
    if (!selectedProfiles.length || !changed || mutation.isPending) return
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
    if (bulk) {
      const prompt = conversionChanged
        ? t(
            'Update {{selected}} selected Profiles? Recharge conversion affects {{affected}} Profiles across shared providers.',
            { selected: selectedProfiles.length, affected: sharedCount }
          )
        : t('Update {{count}} selected Profiles?', {
            count: selectedProfiles.length,
          })
      if (!window.confirm(prompt)) return
    } else if (
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
      ids: selectedProfiles.map((profile) => profile.executionProfileId),
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
          <div className='space-y-2'>
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
            <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
              <span className='text-muted-foreground'>
                {t('{{count}} Profiles selected', {
                  count: selectedProfiles.length,
                })}
              </span>
              <Button
                size='sm'
                variant='ghost'
                disabled={matchingProfiles.length === 0 || mutation.isPending}
                onClick={() => {
                  const matchingIds = matchingProfiles.map(
                    (profile) => profile.executionProfileId
                  )
                  const allSelected = matchingIds.every((id) =>
                    selectedIds.includes(id)
                  )
                  setSelectedIds((current) =>
                    allSelected
                      ? current.filter((id) => !matchingIds.includes(id))
                      : [...new Set([...current, ...matchingIds])]
                  )
                }}
              >
                {matchingProfiles.length > 0 &&
                matchingProfiles.every((profile) =>
                  selectedIds.includes(profile.executionProfileId)
                )
                  ? t('Deselect filtered')
                  : t('Select filtered')}
              </Button>
            </div>
            <div
              role='group'
              aria-label={t('Profiles')}
              className='bg-background max-h-44 min-w-0 space-y-0.5 overflow-y-auto rounded-md border p-1'
            >
              {matchingProfiles.map((profile) => (
                <label
                  key={profile.executionProfileId}
                  className='hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs'
                >
                  <Checkbox
                    checked={selectedIds.includes(profile.executionProfileId)}
                    disabled={mutation.isPending}
                    onCheckedChange={(checked) =>
                      setSelectedIds((current) =>
                        checked
                          ? [...current, profile.executionProfileId]
                          : current.filter(
                              (id) => id !== profile.executionProfileId
                            )
                      )
                    }
                    aria-label={profile.executionProfileId}
                  />
                  <span className='min-w-0 truncate'>
                    <span className='font-medium'>{profile.modelId}</span>
                    {' · '}
                    {profile.channel}
                    <span className='text-muted-foreground'>
                      {' '}
                      · {profile.executionProfileId}
                    </span>
                  </span>
                </label>
              ))}
              {!query.isLoading && matchingProfiles.length === 0 && (
                <p className='text-muted-foreground px-2 py-3 text-xs'>
                  {t('No matching Profiles')}
                </p>
              )}
            </div>
          </div>
          {selectedProfiles.length > 0 && (
            <div className='space-y-2 border-t pt-3'>
              {selected ? (
                <div className='text-muted-foreground min-w-0 text-xs break-all'>
                  {selected.provider} / {selected.channel} ·{' '}
                  {selected.executionProfileId}
                </div>
              ) : (
                <p className='text-muted-foreground text-xs'>
                  {t('Only filled values are applied to selected Profiles.')}
                </p>
              )}
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
                {selected ? (
                  <span className='text-muted-foreground text-xs'>
                    {t(
                      'Conversion belongs to provider {{provider}} and affects {{count}} Profiles.',
                      { provider: providerId, count: sharedCount }
                    )}
                  </span>
                ) : (
                  <span className='text-muted-foreground text-xs'>
                    {t(
                      'Recharge conversion affects {{count}} Profiles across selected providers.',
                      {
                        count: sharedCount,
                      }
                    )}
                  </span>
                )}
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

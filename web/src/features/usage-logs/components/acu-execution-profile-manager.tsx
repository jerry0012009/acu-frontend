import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clipboard, Pencil, Play, Plus, Rocket, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  applyACUExecutionProfiles,
  createACUExecutionProfile,
  getACUExecutionProfiles,
  probeACUExecutionProfile,
  updateACUExecutionProfile,
  type ACUExecutionProfile,
  type ACUExecutionProfileProbeResult,
} from '../api'

const PROTOCOLS = ['responses', 'messages', 'chat_completions'] as const
type Protocol = (typeof PROTOCOLS)[number]

function emptyProfile(): ACUExecutionProfile {
  return {
    executionProfileId: '',
    modelId: '',
    provider: '',
    channel: '',
    protocols: ['responses'],
    apiKeyEnv: '',
    authMode: 'bearer',
    enabled: true,
    administratorAllowed: true,
    activeInAcuAuto: false,
    toolCallSupport: false,
    thinkingSupport: false,
    supportedReasoningEfforts: [],
  }
}

function inputValue(value: string | number | undefined) {
  return value ?? ''
}

function profileWithDefaults(
  profile?: ACUExecutionProfile
): ACUExecutionProfile {
  return {
    ...emptyProfile(),
    ...profile,
    protocols: profile?.protocols?.length
      ? [...profile.protocols]
      : ['responses'],
  }
}

export function ACUExecutionProfileManager() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const profileQuery = useQuery({
    queryKey: ['acu-execution-profiles'],
    queryFn: getACUExecutionProfiles,
    staleTime: 30_000,
  })
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ACUExecutionProfile>(emptyProfile())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [probeProtocol, setProbeProtocol] = useState<Protocol>('responses')
  const [probeResult, setProbeResult] =
    useState<ACUExecutionProfileProbeResult | null>(null)
  const [applyState, setApplyState] = useState<
    'idle' | 'applying' | 'applied' | 'failed'
  >('idle')
  const profiles = profileQuery.data?.data?.profiles ?? []
  const savedState = profileQuery.data?.data

  const openEditor = (profile?: ACUExecutionProfile) => {
    const next = profileWithDefaults(profile)
    setDraft(next)
    setEditingId(profile?.executionProfileId ?? null)
    setProbeProtocol(next.protocols[0] ?? 'responses')
    setProbeResult(null)
    setOpen(true)
  }
  const update = <K extends keyof ACUExecutionProfile>(
    key: K,
    value: ACUExecutionProfile[K]
  ) => setDraft((current) => ({ ...current, [key]: value }))

  const save = useMutation({
    mutationFn: () =>
      editingId
        ? updateACUExecutionProfile(editingId, draft)
        : createACUExecutionProfile(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['acu-execution-profiles'],
      })
      setApplyState('idle')
      setOpen(false)
      toast.success(t('Execution profile configuration saved'))
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('Save failed')),
  })
  const probe = useMutation({
    mutationFn: () => probeACUExecutionProfile(draft, probeProtocol),
    onSuccess: (response) => {
      setProbeResult(response.data ?? null)
      toast.success(t('Targeted probe completed'))
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('Probe failed')),
  })
  const apply = useMutation({
    mutationFn: applyACUExecutionProfiles,
    onSuccess: async () => {
      setApplyState('applying')
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        try {
          const result = await queryClient.fetchQuery({
            queryKey: ['acu-execution-profiles'],
            queryFn: getACUExecutionProfiles,
            staleTime: 0,
          })
          if (result.data && !result.data.applyRequired) {
            setApplyState('applied')
            toast.success(t('Execution profiles applied'))
            return
          }
        } catch {
          // Router is expected to be unavailable briefly while it restarts.
        }
      }
      setApplyState('failed')
      toast.error(t('Router did not report the new profile configuration'))
    },
    onError: (error) => {
      setApplyState('failed')
      toast.error(error instanceof Error ? error.message : t('Apply failed'))
    },
  })

  const copyProbeResult = async () => {
    if (!probeResult) return
    await navigator.clipboard.writeText(JSON.stringify(probeResult, null, 2))
    toast.success(t('Probe result copied'))
  }

  return (
    <>
      <section className='space-y-3 rounded border p-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h3 className='text-sm font-semibold'>{t('Execution Profiles')}</h3>
            <p className='text-muted-foreground text-xs'>
              {savedState?.applyRequired
                ? t('Saved configuration is waiting for Router apply')
                : t('Running Router profile set matches saved configuration')}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button size='sm' variant='outline' onClick={() => openEditor()}>
              <Plus className='size-3.5' />
              {t('Add Profile')}
            </Button>
            <Button
              size='sm'
              disabled={!savedState?.applyRequired || apply.isPending}
              onClick={() => apply.mutate()}
            >
              <Rocket className='size-3.5' />
              {applyState === 'applying'
                ? t('Applying')
                : t('Apply configuration')}
            </Button>
          </div>
        </div>
        <div className='grid gap-2'>
          {profiles.map((profile) => (
            <div
              key={profile.executionProfileId}
              className='flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs'
            >
              <div className='min-w-0'>
                <div className='truncate font-mono'>
                  {profile.executionProfileId}
                </div>
                <div className='text-muted-foreground mt-1'>
                  {profile.provider} / {profile.channel} · {profile.modelId} ·{' '}
                  {profile.protocols.join(', ')}
                </div>
              </div>
              <Button
                size='sm'
                variant='outline'
                onClick={() => openEditor(profile)}
              >
                <Pencil className='size-3.5' />
                {t('Edit')}
              </Button>
            </div>
          ))}
          {!profileQuery.isLoading && profiles.length === 0 && (
            <div className='text-muted-foreground rounded border p-4 text-xs'>
              {t('No saved execution profiles')}
            </div>
          )}
        </div>
        {applyState === 'applied' && (
          <div className='text-xs text-green-700'>{t('Applied')}</div>
        )}
        {applyState === 'failed' && (
          <div className='text-destructive text-xs'>
            {t('Apply status could not be confirmed')}
          </div>
        )}
      </section>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side='right' className='sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle>
              {editingId
                ? t('Edit Execution Profile')
                : t('Add Execution Profile')}
            </SheetTitle>
            <SheetDescription>
              {t(
                'Only saved configuration fields are editable. Runtime health and probe observations are managed by Router.'
              )}
            </SheetDescription>
          </SheetHeader>
          <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-4 text-xs'>
            <div className='grid gap-3 sm:grid-cols-2'>
              {(
                [
                  ['executionProfileId', 'executionProfileId'],
                  ['modelId', 'modelId'],
                  ['providerModelId', 'providerModelId'],
                  ['provider', 'provider'],
                  ['channel', 'channel'],
                  ['channelId', 'channelId'],
                  ['routingGroupName', 'routingGroupName'],
                  ['apiKeyEnv', 'apiKeyEnv'],
                  ['baseUrl', 'baseUrl'],
                  ['baseUrlEnv', 'baseUrlEnv'],
                  ['economicsProviderId', 'economicsProviderId'],
                ] as Array<[keyof ACUExecutionProfile, string]>
              ).map(([key, label]) => (
                <label key={label} className='space-y-1'>
                  <span className='text-muted-foreground'>{label}</span>
                  <input
                    className='bg-background h-8 w-full rounded border px-2'
                    value={inputValue(draft[key] as string | undefined)}
                    onChange={(event) =>
                      update(key, event.target.value as never)
                    }
                  />
                </label>
              ))}
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='space-y-1'>
                <span className='text-muted-foreground'>{t('authMode')}</span>
                <select
                  className='bg-background h-8 w-full rounded border px-2'
                  value={draft.authMode}
                  onChange={(event) =>
                    update(
                      'authMode',
                      event.target.value as ACUExecutionProfile['authMode']
                    )
                  }
                >
                  <option value='bearer'>bearer</option>
                  <option value='x-api-key'>x-api-key</option>
                </select>
              </label>
              <label className='space-y-1'>
                <span className='text-muted-foreground'>
                  {t('observedBillingMultiplier')}
                </span>
                <input
                  className='bg-background h-8 w-full rounded border px-2'
                  type='number'
                  min='0.0001'
                  step='0.0001'
                  value={inputValue(draft.observedBillingMultiplier)}
                  onChange={(event) =>
                    update(
                      'observedBillingMultiplier',
                      event.target.value === ''
                        ? undefined
                        : Number(event.target.value)
                    )
                  }
                />
              </label>
            </div>
            <div className='space-y-2'>
              <div className='text-muted-foreground'>{t('protocols')}</div>
              <div className='flex flex-wrap gap-3'>
                {PROTOCOLS.map((value) => (
                  <label key={value} className='flex items-center gap-1.5'>
                    <input
                      type='checkbox'
                      checked={draft.protocols.includes(value)}
                      onChange={(event) =>
                        update(
                          'protocols',
                          event.target.checked
                            ? [...new Set([...draft.protocols, value])]
                            : draft.protocols.filter((item) => item !== value)
                        )
                      }
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>
            <div className='grid gap-2 sm:grid-cols-2'>
              {(
                [
                  ['enabled', 'enabled'],
                  ['administratorAllowed', 'administratorAllowed'],
                  ['activeInAcuAuto', 'activeInAcuAuto'],
                  ['toolCallSupport', 'toolCallSupport'],
                  ['thinkingSupport', 'thinkingSupport'],
                  ['stripV1Path', 'stripV1Path'],
                ] as Array<[keyof ACUExecutionProfile, string]>
              ).map(([key, label]) => (
                <label key={label} className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={Boolean(draft[key])}
                    onChange={(event) =>
                      update(key, event.target.checked as never)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className='rounded border p-3'>
              <div className='mb-2 font-medium'>{t('Profile pricing')}</div>
              <div className='grid gap-3 sm:grid-cols-2'>
                {(
                  [
                    ['inputPricePerMillion', 'input'],
                    ['outputPricePerMillion', 'output'],
                    ['cachedInputPricePerMillion', 'cached input'],
                    ['cacheWritePricePerMillion', 'cache write'],
                    ['source', 'source'],
                    ['observedAt', 'observedAt'],
                  ] as Array<[string, string]>
                ).map(([key, label]) => (
                  <label key={key} className='space-y-1'>
                    <span className='text-muted-foreground'>{label}</span>
                    <input
                      className='bg-background h-8 w-full rounded border px-2'
                      type={key.includes('Price') ? 'number' : 'text'}
                      step={key.includes('Price') ? '0.000001' : undefined}
                      value={inputValue(
                        draft.billingPrice?.[
                          key as keyof NonNullable<
                            ACUExecutionProfile['billingPrice']
                          >
                        ] as string | number | undefined
                      )}
                      onChange={(event) => {
                        const current = draft.billingPrice ?? {
                          inputPricePerMillion: 0,
                          outputPricePerMillion: 0,
                          currency: 'USD_CREDIT' as const,
                          source: '',
                          observedAt: '',
                          status: 'estimated' as const,
                        }
                        update('billingPrice', {
                          ...current,
                          [key]: key.includes('Price')
                            ? Number(event.target.value)
                            : event.target.value,
                        })
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className='mt-3 flex items-center gap-2'>
                <input
                  type='checkbox'
                  checked={Boolean(draft.billingPrice)}
                  onChange={(event) =>
                    update(
                      'billingPrice',
                      event.target.checked
                        ? (draft.billingPrice ?? {
                            inputPricePerMillion: 0,
                            outputPricePerMillion: 0,
                            currency: 'USD_CREDIT',
                            source: '',
                            observedAt: new Date().toISOString(),
                            status: 'estimated',
                          })
                        : undefined
                    )
                  }
                />
                {t('Store profile billing price')}
              </label>
            </div>
            <div className='space-y-3 rounded border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium'>{t('Targeted probe')}</div>
                <select
                  className='bg-background h-8 rounded border px-2'
                  value={probeProtocol}
                  onChange={(event) =>
                    setProbeProtocol(event.target.value as Protocol)
                  }
                >
                  {draft.protocols.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size='sm'
                variant='outline'
                disabled={probe.isPending || draft.protocols.length === 0}
                onClick={() => probe.mutate()}
              >
                <Play className='size-3.5' />
                {t('Send probe')}
              </Button>
              {probeResult && (
                <div className='space-y-2'>
                  <div
                    className={
                      probeResult.success
                        ? 'text-green-700'
                        : 'text-destructive'
                    }
                  >
                    {probeResult.success ? t('Success') : t('Failure')} ·{' '}
                    {probeResult.httpStatus ?? 'n/a'} ·{' '}
                    {probeResult.latencyMs ?? 'n/a'} ms · ¥
                    {probeResult.costCny.toFixed(6)}
                  </div>
                  <pre className='bg-muted max-h-56 overflow-auto rounded p-2 text-[10px]'>
                    {JSON.stringify(probeResult, null, 2)}
                  </pre>
                  <Button size='sm' variant='ghost' onClick={copyProbeResult}>
                    <Clipboard className='size-3.5' />
                    {t('Copy result JSON')}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              <Save className='size-3.5' />
              {t('Save configuration')}
            </Button>
            <Button variant='outline' onClick={() => setOpen(false)}>
              {t('Cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calculator, Clipboard, Pencil, Play, Plus, Save } from 'lucide-react'
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
  createACUExecutionProfile,
  getACUExecutionProfiles,
  probeACUExecutionProfile,
  updateACUChannelConnection,
  reconcileACUExecutionProfileCalibration,
  updateACUExecutionProfile,
  type ACUExecutionProfile,
  type ACUExecutionProfileProbeResult,
} from '../api'
import { estimateProfileCost, type CostInputs } from './acu-profile-cost'
import { ACUProviderQuickAdd } from './acu-provider-quick-add'

const PROTOCOLS = ['responses', 'messages', 'chat_completions'] as const
type Protocol = (typeof PROTOCOLS)[number]


function emptyProfile(): ACUExecutionProfile {
  return {
    executionProfileId: '',
    modelId: '',
    provider: '',
    channel: '',
    protocols: ['responses'],
    authMode: 'bearer',
    routingEnabled: true,
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
  const [channelBaseUrl, setChannelBaseUrl] = useState('')
  const [channelFallbackUrls, setChannelFallbackUrls] = useState('')
  const [channelApiKey, setChannelApiKey] = useState('')
  const [creditsPerCny, setCreditsPerCny] = useState('')
  const [costInputs, setCostInputs] = useState<CostInputs>({
    inputTokens: '100000',
    outputTokens: '10000',
    cachedInputTokens: '0',
    cachedOutputTokens: '0',
  })
  const savedState = profileQuery.data?.data
  const profiles = savedState?.profiles ?? []

  const openEditor = (profile?: ACUExecutionProfile) => {
    const next = profileWithDefaults(profile)
    setDraft(next)
    setEditingId(profile?.executionProfileId ?? null)
    const providerId = next.economicsProviderId ?? next.provider
    const economics = savedState?.providerEconomics?.find(
      (item) => item.providerId === providerId
    )
    setCreditsPerCny(
      economics?.creditsPerCny === null ||
        economics?.creditsPerCny === undefined
        ? ''
        : String(economics.creditsPerCny)
    )
    setProbeProtocol(next.protocols[0] ?? 'responses')
    setProbeResult(null)
    const connection =
      profileQuery.data?.data?.channels?.[next.channelId || next.channel]
    setChannelBaseUrl(connection?.baseUrl ?? '')
    setChannelFallbackUrls(connection?.fallbackBaseUrls.join('\n') ?? '')
    setChannelApiKey('')
    setOpen(true)
  }
  const update = <K extends keyof ACUExecutionProfile>(
    key: K,
    value: ACUExecutionProfile[K]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key === 'economicsProviderId' || key === 'provider') {
      const nextProviderId = String(value)
      const economics = savedState?.providerEconomics?.find(
        (item) => item.providerId === nextProviderId
      )
      setCreditsPerCny(
        economics?.creditsPerCny === null ||
          economics?.creditsPerCny === undefined
          ? ''
          : String(economics.creditsPerCny)
      )
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (
        creditsPerCny.trim() &&
        (!Number.isFinite(Number(creditsPerCny)) || Number(creditsPerCny) <= 0)
      ) {
        throw new Error(t('Enter a positive balance conversion'))
      }
      const response = editingId
        ? await updateACUExecutionProfile(editingId, draft)
        : await createACUExecutionProfile(draft)
      const providerId = draft.economicsProviderId ?? draft.provider
      const currentEconomics = savedState?.providerEconomics?.find(
        (item) => item.providerId === providerId
      )
      const nextCreditsPerCny = Number(creditsPerCny)
      const savedProfileId =
        editingId ??
        (response.data?.profile &&
        typeof response.data.profile === 'object' &&
        response.data.profile !== null &&
        'executionProfileId' in response.data.profile
          ? String(response.data.profile.executionProfileId)
          : draft.executionProfileId)
      if (
        savedProfileId &&
        Number.isFinite(nextCreditsPerCny) &&
        nextCreditsPerCny > 0 &&
        nextCreditsPerCny !== currentEconomics?.creditsPerCny
      ) {
        await reconcileACUExecutionProfileCalibration(savedProfileId, {
          creditsPerCny: nextCreditsPerCny,
        })
      }
      return response
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['acu-execution-profiles'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['acu-global-routing-policy'],
        }),
        queryClient.invalidateQueries({ queryKey: ['acu-channel-monitor'] }),
        queryClient.invalidateQueries({ queryKey: ['pricing'] }),
      ])
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
  const saveChannel = useMutation({
    mutationFn: () =>
      updateACUChannelConnection(draft.channelId || draft.channel, {
        baseUrl: channelBaseUrl,
        fallbackBaseUrls: channelFallbackUrls
          .split('\n')
          .map((url) => url.trim())
          .filter(Boolean),
        ...(channelApiKey.trim() ? { apiKey: channelApiKey.trim() } : {}),
      }),
    onSuccess: async () => {
      setChannelApiKey('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['acu-execution-profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['acu-channel-monitor'] }),
        queryClient.invalidateQueries({ queryKey: ['pricing'] }),
      ])
      toast.success(t('Channel connection saved'))
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('Save failed')),
  })
  const copyProbeResult = async () => {
    if (!probeResult) return
    await navigator.clipboard.writeText(JSON.stringify(probeResult, null, 2))
    toast.success(t('Probe result copied'))
  }

  const providerId = draft.economicsProviderId ?? draft.provider
  const providerEconomics = savedState?.providerEconomics?.find(
    (item) => item.providerId === providerId
  )
  const channelMultiplier =
    draft.observedBillingMultiplier ??
    providerEconomics?.observedBillingMultiplier ??
    1
  const creditsPerCnyValue = Number(creditsPerCny)
  const retailMarkupMultiplier = savedState?.retailMarkupMultiplier ?? 1.25
  const inputAccountingMode =
    draft.inputTokenAccountingMode ??
    (draft.protocols[0] === 'messages' ? 'excludes_cached' : 'includes_cached')
  const {
    nominalCostUsd,
    platformDebitCredits,
    providerCostCny,
    userChargeCny,
  } = estimateProfileCost(
    draft.billingPrice,
    costInputs,
    inputAccountingMode,
    channelMultiplier,
    creditsPerCnyValue,
    retailMarkupMultiplier
  )
  const updateCostInput = (key: keyof CostInputs, value: string) =>
    setCostInputs((current) => ({ ...current, [key]: value }))

  return (
    <>
      <section className='space-y-3 rounded border p-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h3 className='text-sm font-semibold'>{t('Execution Profiles')}</h3>
            <p className='text-muted-foreground text-xs'>
              {t('Changes take effect immediately')}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <ACUProviderQuickAdd />
            <Button size='sm' variant='outline' onClick={() => openEditor()}>
              <Plus className='size-3.5' />
              {t('Advanced Add Profile')}
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
            {editingId && (
              <div className='space-y-3 border-t pt-4'>
                <div className='text-sm font-medium'>
                  {t('Channel connection')} · {draft.channelId || draft.channel}
                </div>
                <label className='block space-y-1'>
                  <span className='text-muted-foreground'>{t('Base URL')}</span>
                  <input
                    className='bg-background h-8 w-full rounded border px-2'
                    value={channelBaseUrl}
                    onChange={(event) => setChannelBaseUrl(event.target.value)}
                  />
                </label>
                <label className='block space-y-1'>
                  <span className='text-muted-foreground'>
                    {t('Fallback URLs (one per line)')}
                  </span>
                  <textarea
                    className='bg-background min-h-16 w-full rounded border px-2 py-1'
                    value={channelFallbackUrls}
                    onChange={(event) =>
                      setChannelFallbackUrls(event.target.value)
                    }
                  />
                </label>
                <label className='block space-y-1'>
                  <span className='text-muted-foreground'>
                    {t('Replace API Key (leave blank to keep current)')}
                  </span>
                  <input
                    type='password'
                    autoComplete='new-password'
                    className='bg-background h-8 w-full rounded border px-2'
                    value={channelApiKey}
                    onChange={(event) => setChannelApiKey(event.target.value)}
                  />
                </label>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={saveChannel.isPending || !channelBaseUrl.trim()}
                  onClick={() => saveChannel.mutate()}
                >
                  <Save className='size-3.5' />
                  {t('Save Channel')}
                </Button>
              </div>
            )}
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
                  {t('Global Profile weight')}
                </span>
                <input
                  className='bg-background h-8 w-full rounded border px-2'
                  type='number'
                  min={0}
                  max={200}
                  step={0.1}
                  value={inputValue(draft.routingWeight ?? 100)}
                  onChange={(event) =>
                    update(
                      'routingWeight',
                      event.target.value === ''
                        ? 100
                        : Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className='space-y-1'>
                <span className='text-muted-foreground'>
                  {t('inputTokenAccountingMode')}
                </span>
                <select
                  className='bg-background h-8 w-full rounded border px-2'
                  value={draft.inputTokenAccountingMode ?? ''}
                  onChange={(event) =>
                    update(
                      'inputTokenAccountingMode',
                      event.target.value === ''
                        ? undefined
                        : (event.target
                            .value as ACUExecutionProfile['inputTokenAccountingMode'])
                    )
                  }
                >
                  <option value=''>{t('Protocol default')}</option>
                  <option value='includes_cached'>
                    {t('Total input includes cached tokens')}
                  </option>
                  <option value='excludes_cached'>
                    {t('Input excludes cached tokens')}
                  </option>
                </select>
              </label>
            </div>
            <div className='space-y-3 rounded border p-3'>
              <div className='flex items-start gap-2'>
                <Calculator className='text-muted-foreground mt-0.5 size-4' />
                <div>
                  <div className='font-medium'>{t('Profile economics')}</div>
                  <p className='text-muted-foreground mt-1 text-[11px]'>
                    {t(
                      'Balance conversion and channel multiplier are used by the cost calculator below.'
                    )}
                  </p>
                </div>
              </div>
              <div className='grid gap-3 sm:grid-cols-2'>
                <label className='space-y-1'>
                  <span className='text-muted-foreground'>
                    {t('USD credits per RMB')}
                  </span>
                  <input
                    className='bg-background h-8 w-full rounded border px-2'
                    type='number'
                    min='0.000001'
                    step='0.000001'
                    value={creditsPerCny}
                    onChange={(event) => setCreditsPerCny(event.target.value)}
                  />
                  <span className='text-muted-foreground block text-[10px]'>
                    {providerEconomics?.balanceCurrency ||
                      'USD-denominated credits'}
                    {providerEconomics?.rechargeCashCny !== null &&
                    providerEconomics?.rechargeCashCny !== undefined &&
                    providerEconomics?.creditsReceivedUsd !== null &&
                    providerEconomics?.creditsReceivedUsd !== undefined
                      ? ` · ¥${providerEconomics.rechargeCashCny} = ${providerEconomics.creditsReceivedUsd} credits`
                      : ''}
                    {Number.isFinite(creditsPerCnyValue) &&
                    creditsPerCnyValue > 0
                      ? ` · 1 credit = ¥${(1 / creditsPerCnyValue).toFixed(8)}`
                      : ''}
                  </span>
                </label>
                <label className='space-y-1'>
                  <span className='text-muted-foreground'>
                    {t('Channel billing multiplier')}
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
                  <span className='text-muted-foreground block text-[10px]'>
                    {t('Provider default')}:{' '}
                    {providerEconomics?.observedBillingMultiplier ?? 'n/a'}x
                  </span>
                </label>
              </div>
              <div className='bg-muted/40 grid gap-2 rounded p-2 text-[11px] sm:grid-cols-2'>
                <div>
                  <span className='text-muted-foreground'>
                    {t('Retail markup')}
                  </span>
                  <div className='font-mono'>
                    {retailMarkupMultiplier.toFixed(4)}x
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>
                    {t('Effective cash multiplier')}
                  </span>
                  <div className='font-mono'>
                    {Number.isFinite(creditsPerCnyValue) &&
                    creditsPerCnyValue > 0
                      ? `${(channelMultiplier / creditsPerCnyValue).toFixed(8)} CNY / nominal USD`
                      : 'n/a'}
                  </div>
                </div>
              </div>
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
                  ['routingEnabled', t('Global routing')],
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
                    ['cacheWritePricePerMillion', 'cache output / write'],
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
              <div className='flex items-center gap-2 font-medium'>
                <Calculator className='size-4' />
                {t('Cost calculator')}
              </div>
              <p className='text-muted-foreground text-[11px]'>
                {t(
                  'Enter token usage to compare upstream cost with the expected user charge.'
                )}
              </p>
              <div className='grid gap-3 sm:grid-cols-2'>
                {(
                  [
                    ['inputTokens', 'Input tokens'],
                    ['outputTokens', 'Output tokens'],
                    ['cachedInputTokens', 'Cached input tokens'],
                    ['cachedOutputTokens', 'Cache write tokens'],
                  ] as Array<[keyof CostInputs, string]>
                ).map(([key, label]) => (
                  <label key={key} className='space-y-1'>
                    <span className='text-muted-foreground'>{t(label)}</span>
                    <input
                      className='bg-background h-8 w-full rounded border px-2 font-mono'
                      type='number'
                      min='0'
                      step='1'
                      value={costInputs[key]}
                      onChange={(event) =>
                        updateCostInput(key, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
              <div className='grid gap-2 border-t pt-3 text-[11px] sm:grid-cols-2'>
                <div>
                  <span className='text-muted-foreground'>
                    {t('Nominal upstream cost')}
                  </span>
                  <div className='font-mono'>
                    {nominalCostUsd === undefined
                      ? t('n/a')
                      : `$${nominalCostUsd.toFixed(8)} USD credits`}
                  </div>
                  <span className='text-muted-foreground block text-[10px]'>
                    {t('Input accounting')}: {inputAccountingMode}
                  </span>
                </div>
                <div>
                  <span className='text-muted-foreground'>
                    {t('Platform balance debit')}
                  </span>
                  <div className='font-mono'>
                    {platformDebitCredits === undefined
                      ? t('n/a')
                      : `${platformDebitCredits.toFixed(8)} credits`}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>
                    {t('Final provider cost')}
                  </span>
                  <div className='font-mono'>
                    {providerCostCny === undefined
                      ? 'n/a'
                      : `¥${providerCostCny.toFixed(8)}`}
                  </div>
                </div>
                <div>
                  <span className='text-muted-foreground'>
                    {t('Expected user charge')}
                  </span>
                  <div className='font-mono font-semibold'>
                    {userChargeCny === undefined
                      ? 'n/a'
                      : `¥${userChargeCny.toFixed(8)}`}
                  </div>
                </div>
              </div>
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

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Play, Plus, Save, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
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
  quickAddACUProviderDiscover,
  quickAddACUProviderProbe,
  quickAddACUProviderSave,
  type ACUQuickAddConnection,
  type ACUQuickAddDiscoveredModel,
  type ACUQuickAddDiscovery,
  type ACUExecutionProfileProbeResult,
} from '../api'

const PROTOCOLS = ['responses', 'chat_completions', 'messages'] as const
type Protocol = (typeof PROTOCOLS)[number]
type PriceDraft = {
  inputPricePerMillion?: number
  outputPricePerMillion?: number
  cachedInputPricePerMillion?: number
  cacheWritePricePerMillion?: number
}

type QuickModel = ACUQuickAddDiscoveredModel & {
  selected: boolean
  protocols: Protocol[]
  price?: PriceDraft
  observedBillingMultiplier?: number
  activeInAcuAuto: boolean
  existingProtocols: Protocol[]
}

const blankConnection: ACUQuickAddConnection = {
  providerName: '',
  baseUrl: '',
  apiKey: '',
  creditsPerCny: 1,
  defaultBillingMultiplier: 1,
}

function modelKey(model: QuickModel, protocol: Protocol) {
  return `${model.providerModelId}:${protocol}`
}

function knownPrice(model: QuickModel): PriceDraft | undefined {
  if (!model.catalog) return model.price
  return {
    inputPricePerMillion: model.catalog.inputPricePerMillion ?? undefined,
    outputPricePerMillion: model.catalog.outputPricePerMillion ?? undefined,
    cachedInputPricePerMillion:
      model.catalog.cachedInputPricePerMillion ?? undefined,
    cacheWritePricePerMillion:
      model.catalog.cacheWritePricePerMillion ?? undefined,
  }
}

function hasRequiredPrice(model: QuickModel) {
  if (model.catalogKnown) return true
  return (
    Number.isFinite(model.price?.inputPricePerMillion) &&
    Number.isFinite(model.price?.outputPricePerMillion)
  )
}

function displayPrice(value: number | undefined) {
  return value === undefined ? 'n/a' : `$${value} / 1M`
}

function ProbeSummary(props: {
  result: ACUExecutionProfileProbeResult
  price?: PriceDraft
  currentMultiplier: number
  creditsPerCny: number
  actualDebit: string
  onActualDebitChange: (value: string) => void
  onUseRecommended: () => void
}) {
  const { t } = useTranslation()
  const nominal = Number(props.result.costBreakdown.catalogNominalCostUsd)
  const actualDebit = Number(props.actualDebit)
  const recommended =
    nominal > 0 && Number.isFinite(actualDebit) && actualDebit >= 0
      ? actualDebit / nominal
      : undefined
  const estimatedPlatformDebit = nominal * props.currentMultiplier
  const estimatedCny =
    props.creditsPerCny > 0
      ? estimatedPlatformDebit / props.creditsPerCny
      : undefined
  return (
    <div className='space-y-2 rounded border p-2 text-[11px]'>
      <div
        className={props.result.success ? 'text-green-700' : 'text-destructive'}
      >
        {props.result.success ? t('Success') : t('Failure')} ·{' '}
        {props.result.httpStatus ?? 'n/a'} · {props.result.latencyMs ?? 'n/a'}{' '}
        ms
      </div>
      <div className='text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1'>
        <span>Input price / 1M</span>
        <span>{displayPrice(props.price?.inputPricePerMillion)}</span>
        <span>Output price / 1M</span>
        <span>{displayPrice(props.price?.outputPricePerMillion)}</span>
        <span>Cached input price / 1M</span>
        <span>{displayPrice(props.price?.cachedInputPricePerMillion)}</span>
        <span>Cache write price / 1M</span>
        <span>{displayPrice(props.price?.cacheWritePricePerMillion)}</span>
        <span>Input tokens</span>
        <span>{props.result.inputTokens}</span>
        <span>Cached input tokens</span>
        <span>{props.result.cachedInputTokens}</span>
        <span>Cache creation tokens</span>
        <span>{props.result.cacheCreationInputTokens}</span>
        <span>Output tokens</span>
        <span>{props.result.outputTokens}</span>
        <span>Reasoning tokens</span>
        <span>{props.result.reasoningTokens}</span>
        <span>Input accounting</span>
        <span>
          {props.result.inputTokenAccountingMode === 'includes_cached'
            ? t('Total input includes cached tokens')
            : t('Input excludes cached tokens')}
        </span>
        <span>Nominal model cost USD</span>
        <span>{nominal.toFixed(8)}</span>
        <span>Current billing multiplier</span>
        <span>{props.currentMultiplier.toFixed(4)}×</span>
        <span>Estimated platform debit</span>
        <span>{estimatedPlatformDebit.toFixed(8)} credits</span>
        <span>Credits per CNY</span>
        <span>1 RMB = {props.creditsPerCny} credits</span>
        <span>Estimated CNY cost</span>
        <span>
          ¥{estimatedCny === undefined ? 'n/a' : estimatedCny.toFixed(8)}
        </span>
      </div>
      {props.result.success && (
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
              value={props.actualDebit}
              onChange={(event) =>
                props.onActualDebitChange(event.target.value)
              }
            />
          </label>
          <div className='text-muted-foreground'>
            {recommended === undefined
              ? t('Recommended multiplier unavailable')
              : `${t('Recommended multiplier')}: ${recommended.toFixed(4)}×`}
            {recommended !== undefined && (
              <Button
                size='sm'
                variant='ghost'
                className='ml-1'
                onClick={props.onUseRecommended}
              >
                {t('Use')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ACUProviderQuickAdd() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [connection, setConnection] =
    useState<ACUQuickAddConnection>(blankConnection)
  const [discovery, setDiscovery] = useState<ACUQuickAddDiscovery | null>(null)
  const [models, setModels] = useState<QuickModel[]>([])
  const [search, setSearch] = useState('')
  const [probeResults, setProbeResults] = useState<
    Record<string, ACUExecutionProfileProbeResult>
  >({})
  const [actualDebits, setActualDebits] = useState<Record<string, string>>({})
  const [manualModel, setManualModel] = useState('')

  const updateConnection = <K extends keyof ACUQuickAddConnection>(
    key: K,
    value: ACUQuickAddConnection[K]
  ) => setConnection((current) => ({ ...current, [key]: value }))

  const discover = useMutation({
    mutationFn: () => quickAddACUProviderDiscover(connection),
    onSuccess: (response) => {
      const data = response.data
      if (!data) return
      setDiscovery(data)
      const existingEconomics = data.existingProviderEconomics
      if (existingEconomics) {
        setConnection((current) => ({
          ...current,
          providerName:
            current.providerName || existingEconomics.displayName || '',
          creditsPerCny: existingEconomics.creditsPerCny,
          defaultBillingMultiplier: existingEconomics.defaultBillingMultiplier,
        }))
      }
      setModels(
        data.models.map((model) => {
          const existingProtocols = data.existingProfiles
            .filter(
              (profile) =>
                profile.providerModelId === model.providerModelId &&
                profile.modelId ===
                  (model.catalog?.modelId ?? model.providerModelId)
            )
            .flatMap((profile) => profile.protocols)
          const defaultProtocols = PROTOCOLS.filter(
            (protocol) => !existingProtocols.includes(protocol)
          )
          return {
            ...model,
            selected: model.catalogKnown,
            protocols: defaultProtocols,
            activeInAcuAuto: model.catalogKnown,
            existingProtocols: [...new Set(existingProtocols)],
          }
        })
      )
      setProbeResults({})
      setStep(2)
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('Discovery failed')
      ),
  })

  const filteredModels = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return models
    return models.filter((model) =>
      model.providerModelId.toLowerCase().includes(needle)
    )
  }, [models, search])

  const selectedPairs = useMemo(
    () =>
      models.flatMap((model) =>
        model.selected
          ? model.protocols.map((protocol) => ({ model, protocol }))
          : []
      ),
    [models]
  )

  const probe = useMutation({
    mutationFn: async () => {
      const authMode = discovery?.authMode ?? 'bearer'
      const next: Record<string, ACUExecutionProfileProbeResult> = {}
      for (const pair of selectedPairs) {
        if (!hasRequiredPrice(pair.model)) {
          throw new Error(
            `${pair.model.providerModelId}: ${t('input and output prices are required')}`
          )
        }
        const result = await quickAddACUProviderProbe({
          connection,
          authMode,
          model: {
            providerModelId: pair.model.providerModelId,
            ...(pair.model.catalog?.modelId
              ? { modelId: pair.model.catalog.modelId }
              : {}),
            ...(pair.model.price ? { billingPrice: pair.model.price } : {}),
            observedBillingMultiplier:
              pair.model.observedBillingMultiplier ??
              connection.defaultBillingMultiplier,
          },
          protocol: pair.protocol,
        })
        if (result.data) next[modelKey(pair.model, pair.protocol)] = result.data
      }
      return next
    },
    onSuccess: (next) => {
      setProbeResults(next)
      setStep(3)
      toast.success(t('Targeted probes completed'))
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('Probe failed')),
  })

  const save = useMutation({
    mutationFn: async () => {
      const authMode = discovery?.authMode ?? 'bearer'
      const candidates = models.flatMap((model) => {
        if (!model.selected) return []
        const successfulProtocols = model.protocols.filter(
          (protocol) => probeResults[modelKey(model, protocol)]?.success
        )
        if (successfulProtocols.length === 0) return []
        return [
          {
            providerModelId: model.providerModelId,
            ...(model.catalog?.modelId
              ? { modelId: model.catalog.modelId }
              : {}),
            protocols: successfulProtocols,
            ...(model.price ? { billingPrice: model.price } : {}),
            ...(model.observedBillingMultiplier
              ? { observedBillingMultiplier: model.observedBillingMultiplier }
              : {}),
            ...(model.activeInAcuAuto ? { activeInAcuAuto: true } : {}),
          },
        ]
      })
      if (candidates.length === 0) {
        throw new Error(t('No successful profile probes to save'))
      }
      return quickAddACUProviderSave({
        connection,
        authMode,
        models: candidates,
      })
    },
    onSuccess: async (response) => {
      if (response.data) {
        await queryClient.invalidateQueries({
          queryKey: ['acu-execution-profiles'],
        })
      }
      toast.success(t('Quick Add configuration saved'))
      setOpen(false)
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('Save failed')),
  })

  const reset = () => {
    setStep(1)
    setConnection(blankConnection)
    setDiscovery(null)
    setModels([])
    setSearch('')
    setProbeResults({})
    setActualDebits({})
    setManualModel('')
  }

  const addManualModel = () => {
    const providerModelId = manualModel.trim()
    if (
      !providerModelId ||
      models.some((model) => model.providerModelId === providerModelId)
    ) {
      return
    }
    setModels((current) => [
      ...current,
      {
        providerModelId,
        catalogKnown: false,
        selected: true,
        protocols: [...PROTOCOLS],
        activeInAcuAuto: false,
        existingProtocols: [],
      },
    ])
    setManualModel('')
  }

  const updateModel = (providerModelId: string, patch: Partial<QuickModel>) => {
    if ('price' in patch) {
      setProbeResults((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key]) => !key.startsWith(`${providerModelId}:`)
          )
        )
      )
    }
    setModels((current) =>
      current.map((model) =>
        model.providerModelId === providerModelId
          ? { ...model, ...patch }
          : model
      )
    )
  }

  return (
    <>
      <Button
        size='sm'
        variant='outline'
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        <Plus className='size-3.5' />
        {t('Quick Add Provider')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side='right' className='sm:max-w-3xl'>
          <SheetHeader>
            <SheetTitle>{t('Quick Add Provider')}</SheetTitle>
            <SheetDescription>
              {t(
                'Discover models, run targeted probes, then save profiles for Router apply.'
              )}
            </SheetDescription>
          </SheetHeader>
          <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-4 text-xs'>
            <div className='text-muted-foreground flex items-center gap-2'>
              {[1, 2, 3].map((value) => {
                let label = t('Probe & Save')
                if (value === 1) label = t('Connection')
                if (value === 2) label = t('Models')
                return (
                  <span
                    key={value}
                    className={
                      value === step ? 'text-foreground font-semibold' : ''
                    }
                  >
                    {value}. {label}
                  </span>
                )
              })}
            </div>
            {step === 1 && (
              <div className='space-y-3'>
                {(
                  [
                    ['providerName', t('Provider name'), 'text'],
                    ['baseUrl', t('Base URL'), 'url'],
                    ['apiKey', t('API Key'), 'password'],
                  ] as const
                ).map(([key, label, type]) => (
                  <label key={key} className='block space-y-1'>
                    <span className='text-muted-foreground'>{label}</span>
                    <input
                      className='bg-background h-9 w-full rounded border px-2'
                      type={type}
                      value={connection[key]}
                      onChange={(event) =>
                        updateConnection(key, event.target.value)
                      }
                    />
                  </label>
                ))}
                <div className='grid gap-3 sm:grid-cols-2'>
                  {(
                    [
                      ['creditsPerCny', t('Platform USD credits per RMB')],
                      [
                        'defaultBillingMultiplier',
                        t('Default billing multiplier'),
                      ],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className='space-y-1'>
                      <span className='text-muted-foreground'>{label}</span>
                      <input
                        className='bg-background h-9 w-full rounded border px-2'
                        type='number'
                        min='0.000001'
                        step='0.01'
                        value={connection[key]}
                        onChange={(event) =>
                          updateConnection(key, Number(event.target.value))
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className='text-muted-foreground'>
                  {t(
                    '1 RMB = X platform USD credits. The multiplier is applied to nominal model cost.'
                  )}
                </p>
                <Button
                  disabled={discover.isPending}
                  onClick={() => discover.mutate()}
                >
                  <Search className='size-3.5' />
                  {discover.isPending ? t('Discovering') : t('Discover models')}
                </Button>
              </div>
            )}
            {step === 2 && (
              <div className='space-y-3'>
                {discovery?.message && (
                  <div className='rounded border border-amber-300 p-2 text-amber-800'>
                    {t(discovery.message)}
                  </div>
                )}
                {discovery?.existingProviderEconomics && (
                  <div className='rounded border border-blue-300 p-2 text-blue-800'>
                    {t('Using existing Provider Economics')}: 1 RMB ={' '}
                    {discovery.existingProviderEconomics.creditsPerCny}{' '}
                    {t('credits')},{' '}
                    {discovery.existingProviderEconomics.defaultBillingMultiplier.toFixed(
                      4
                    )}
                    ×
                  </div>
                )}
                <div className='flex gap-2'>
                  <input
                    className='bg-background h-8 min-w-0 flex-1 rounded border px-2'
                    placeholder={t('Filter models')}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {!discovery?.directoryAvailable && (
                    <>
                      <input
                        className='bg-background h-8 min-w-0 flex-1 rounded border px-2'
                        placeholder={t('Provider model ID')}
                        value={manualModel}
                        onChange={(event) => setManualModel(event.target.value)}
                      />
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={addManualModel}
                      >
                        <Plus className='size-3.5' />
                      </Button>
                    </>
                  )}
                </div>
                <div className='space-y-2'>
                  {filteredModels.map((model) => (
                    <div
                      key={model.providerModelId}
                      className='space-y-2 rounded border p-3'
                    >
                      <div className='flex items-start gap-2'>
                        <input
                          type='checkbox'
                          checked={model.selected}
                          onChange={(event) =>
                            updateModel(model.providerModelId, {
                              selected: event.target.checked,
                            })
                          }
                        />
                        <div className='min-w-0 flex-1'>
                          <div className='font-mono'>
                            {model.providerModelId}
                          </div>
                          <div className='text-muted-foreground'>
                            {model.catalog?.displayName ??
                              t('Unknown catalog model')}
                            {model.catalogKnown
                              ? ` · ${t('catalog known')}`
                              : ` · ${t('explicit only')}`}
                          </div>
                        </div>
                        {model.selected && (
                          <Check className='size-4 text-green-700' />
                        )}
                      </div>
                      {model.selected && (
                        <>
                          <div className='flex flex-wrap gap-3'>
                            {PROTOCOLS.map((protocol) => (
                              <label
                                key={protocol}
                                className='flex items-center gap-1'
                              >
                                <input
                                  type='checkbox'
                                  checked={model.protocols.includes(protocol)}
                                  onChange={(event) =>
                                    updateModel(model.providerModelId, {
                                      protocols: event.target.checked
                                        ? [
                                            ...new Set([
                                              ...model.protocols,
                                              protocol,
                                            ]),
                                          ]
                                        : model.protocols.filter(
                                            (item) => item !== protocol
                                          ),
                                    })
                                  }
                                />
                                {protocol}
                                {model.existingProtocols.includes(protocol)
                                  ? ` · ${t('exists')}`
                                  : ''}
                              </label>
                            ))}
                          </div>
                          <div className='grid gap-2 sm:grid-cols-2'>
                            {(
                              [
                                'inputPricePerMillion',
                                'outputPricePerMillion',
                                'cachedInputPricePerMillion',
                                'cacheWritePricePerMillion',
                              ] as const
                            ).map((field) => (
                              <label key={field} className='space-y-1'>
                                <span className='text-muted-foreground'>
                                  {field}
                                </span>
                                <input
                                  className='bg-background h-8 w-full rounded border px-2'
                                  type='number'
                                  min='0'
                                  step='0.000001'
                                  value={
                                    model.price?.[field] ??
                                    knownPrice(model)?.[field] ??
                                    ''
                                  }
                                  onChange={(event) =>
                                    updateModel(model.providerModelId, {
                                      price: {
                                        ...knownPrice(model),
                                        ...model.price,
                                        [field]:
                                          event.target.value === ''
                                            ? undefined
                                            : Number(event.target.value),
                                      },
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                          <label className='flex items-center gap-2'>
                            <input
                              type='checkbox'
                              checked={model.activeInAcuAuto}
                              disabled={!model.catalogKnown}
                              onChange={(event) =>
                                updateModel(model.providerModelId, {
                                  activeInAcuAuto: event.target.checked,
                                })
                              }
                            />
                            {t('Add to ACU Auto')}
                          </label>
                        </>
                      )}
                    </div>
                  ))}
                  {filteredModels.length === 0 && (
                    <div className='text-muted-foreground rounded border p-3'>
                      {t('No discovered models')}
                    </div>
                  )}
                </div>
              </div>
            )}
            {step === 3 && (
              <div className='space-y-3'>
                {selectedPairs.map((pair) => {
                  const key = modelKey(pair.model, pair.protocol)
                  const result = probeResults[key]
                  return (
                    <div key={key} className='space-y-2 rounded border p-3'>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='font-mono'>
                          {pair.model.providerModelId} · {pair.protocol}
                        </span>
                        {result?.success && (
                          <Check className='size-4 text-green-700' />
                        )}
                        {result && !result.success && (
                          <X className='text-destructive size-4' />
                        )}
                      </div>
                      {result && (
                        <ProbeSummary
                          result={result}
                          price={pair.model.price ?? knownPrice(pair.model)}
                          currentMultiplier={
                            pair.model.observedBillingMultiplier ??
                            connection.defaultBillingMultiplier
                          }
                          creditsPerCny={connection.creditsPerCny}
                          actualDebit={actualDebits[key] ?? ''}
                          onActualDebitChange={(value) =>
                            setActualDebits((current) => ({
                              ...current,
                              [key]: value,
                            }))
                          }
                          onUseRecommended={() => {
                            const nominal = Number(
                              result.costBreakdown.catalogNominalCostUsd
                            )
                            const debit = Number(actualDebits[key])
                            if (nominal <= 0 || !Number.isFinite(debit)) return
                            updateModel(pair.model.providerModelId, {
                              observedBillingMultiplier: debit / nominal,
                            })
                          }}
                        />
                      )}
                    </div>
                  )
                })}
                <div className='text-muted-foreground'>
                  {t(
                    'Only successful model and protocol probes will be submitted.'
                  )}
                </div>
              </div>
            )}
          </div>
          <SheetFooter>
            {step > 1 && (
              <Button variant='outline' onClick={() => setStep(step - 1)}>
                {t('Back')}
              </Button>
            )}
            {step === 2 && (
              <Button
                disabled={selectedPairs.length === 0 || probe.isPending}
                onClick={() => probe.mutate()}
              >
                <Play className='size-3.5' />
                {probe.isPending ? t('Probing') : t('Probe selected')}
              </Button>
            )}
            {step === 3 && (
              <>
                <Button variant='outline' onClick={() => setStep(2)}>
                  {t('Adjust selection')}
                </Button>
                <Button disabled={save.isPending} onClick={() => save.mutate()}>
                  <Save className='size-3.5' />
                  {save.isPending ? t('Saving') : t('Save profiles')}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

type ModelPrice = {
  modelId: string
  multiplier: string
  referenceCurrency: 'USD' | 'CNY'
  referenceSource: string
  referenceObservedAt: string
  referenceVerified?: boolean
  referencePrices: Record<string, unknown>
}
type PriceBook = {
  version: string
  effectiveAt: string
  fxCnyPerUsd: string
  models: ModelPrice[]
}
type Economics = {
  models: Array<{
    model_id: string
    calls: string
    input_tokens?: string
    output_tokens?: string
    cached_input_tokens?: string
    cost_cny: string
    revenue_cny: string
    probe_cost_cny: string
    judge_cost_cny: string
    totalRecordedCostCny: string
    totalRevenueCny: string
    suggestedMultiplier: string | null
    observedCostMultiplier: number | null
    matchedCoverage: number
    replayRevenueCny?: string | null
    replayCoverage?: number
  }>
  totals: { calls: number; revenueCny: string; recordedCostCny: string }
}
type PricingResponse = {
  active: PriceBook | null
  initialModels: ModelPrice[]
  economics: Economics
  versions: Array<{
    version: string
    effective_at: string
    cancelled_at?: string | null
  }>
}

async function loadPricing(days: number): Promise<PricingResponse> {
  const response = await api.get('/api/option/acu-retail-pricing', {
    params: { days },
  })
  if (!response.data.success) {
    throw new Error(response.data.message || 'Pricing unavailable')
  }
  return response.data.data
}

export function ACURetailPricing() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [days, setDays] = useState(30)
  const [draft, setDraft] = useState<PriceBook | null>(null)
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<Economics | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [references, setReferences] = useState('')
  const [referenceError, setReferenceError] = useState('')
  const [pendingReferences, setPendingReferences] = useState(false)
  const currentDraft = useRef('')
  currentDraft.current = JSON.stringify(draft)
  const query = useQuery({
    queryKey: ['acu-retail-pricing', days],
    queryFn: () => loadPricing(days),
  })
  const mutation = useMutation({
    mutationFn: async (publish: boolean) => {
      const submittedDraft = JSON.stringify(draft)
      const response = await api.post(
        '/api/option/acu-retail-pricing',
        { book: draft, reason, publish },
        { params: { days } }
      )
      if (!response.data.success) {
        throw new Error(response.data.message || 'Pricing update failed')
      }
      return { publish, data: response.data.data, submittedDraft }
    },
    onSuccess: (result) => {
      if (result.publish) {
        setDraft(null)
        setPreview(null)
        void client.invalidateQueries({ queryKey: ['acu-retail-pricing'] })
      } else if (result.submittedDraft === currentDraft.current) {
        setPreview(result.data.economics)
      }
    },
  })
  const cancellation = useMutation({
    mutationFn: async (version: string) => {
      const response = await api.post('/api/option/acu-retail-pricing', {
        cancelVersion: version,
        reason,
      })
      if (!response.data.success) {
        throw new Error(response.data.message || 'Cancellation failed')
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['acu-retail-pricing'] })
    },
  })
  function changeDraft(next: PriceBook) {
    setDraft(next)
    setPreview(null)
    setConfirmed(false)
  }
  if (query.isPending) return <p role='status'>{t('Loading...')}</p>
  if (query.isError) return <p role='alert'>{query.error.message}</p>
  const data = query.data
  const economics = preview ?? data.economics
  const sourcePrices = data.active?.models ?? []
  const modelPrices = draft?.models ?? [
    ...sourcePrices,
    ...data.initialModels.filter(
      (model) => !sourcePrices.some((price) => price.modelId === model.modelId)
    ),
  ]
  const rows = new Map(economics.models.map((model) => [model.model_id, model]))
  return (
    <section className='min-w-0 space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>{t('ACU Model Multipliers')}</h2>
        <select
          aria-label={t('Time range')}
          className='border-input h-9 rounded border px-2'
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[7, 30, 90].map((value) => (
            <option key={value} value={value}>
              {value} {t('days')}
            </option>
          ))}
        </select>
      </div>
      <dl className='flex flex-wrap gap-x-8 gap-y-2 text-sm'>
        <div>
          <dt className='text-muted-foreground'>{t('Requests')}</dt>
          <dd>{economics.totals.calls.toLocaleString()}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>{t('Revenue')}</dt>
          <dd>CNY {Number(economics.totals.revenueCny).toFixed(2)}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>{t('Recorded cost')}</dt>
          <dd>CNY {Number(economics.totals.recordedCostCny).toFixed(2)}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>{t('Price version')}</dt>
          <dd>{data.active?.version ?? t('Not published')}</dd>
        </div>
      </dl>
      {!draft && (
        <Button
          onClick={() => {
            const models = structuredClone(modelPrices)
            setReferences(JSON.stringify(models, null, 2))
            setPendingReferences(false)
            changeDraft({
              version: `retail-${Date.now()}`,
              effectiveAt: '',
              fxCnyPerUsd: data.active?.fxCnyPerUsd ?? '6.74',
              models,
            })
          }}
        >
          {t('Create price draft')}
        </Button>
      )}
      {draft && (
        <div className='grid gap-3 sm:grid-cols-3'>
          <label className='space-y-1 text-sm'>
            {t('Price version')}
            <Input
              value={draft.version}
              onChange={(event) =>
                changeDraft({ ...draft, version: event.target.value })
              }
            />
          </label>
          <label className='space-y-1 text-sm'>
            {t('USD/CNY')}
            <Input
              inputMode='decimal'
              value={draft.fxCnyPerUsd}
              onChange={(event) =>
                changeDraft({ ...draft, fxCnyPerUsd: event.target.value })
              }
            />
          </label>
          <label className='space-y-1 text-sm'>
            {t('Effective at (UTC)')}
            <Input
              type='datetime-local'
              value={draft.effectiveAt ? draft.effectiveAt.slice(0, 16) : ''}
              onChange={(event) =>
                changeDraft({
                  ...draft,
                  effectiveAt: event.target.value
                    ? `${event.target.value}:00Z`
                    : '',
                })
              }
            />
          </label>
        </div>
      )}
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[850px] text-left text-sm'>
          <thead className='border-b text-xs'>
            <tr>
              {[
                'Model',
                'Requests',
                'Revenue',
                'Recorded cost',
                'Matched coverage',
                'Observed cost multiplier',
                'Suggested multiplier',
                'Price multiplier',
                'Replay revenue',
              ].map((label) => (
                <th className='px-2 py-3 font-medium' key={label}>
                  {t(label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modelPrices.map((model, index) => {
              const row = rows.get(model.modelId)
              return (
                <tr key={model.modelId} className='border-b'>
                  <th className='px-2 py-2 font-normal'>{model.modelId}</th>
                  <td className='px-2 py-2'>{row?.calls ?? '0'}</td>
                  <td className='px-2 py-2'>
                    {Number(row?.totalRevenueCny ?? 0).toFixed(2)}
                  </td>
                  <td className='px-2 py-2'>
                    {Number(row?.totalRecordedCostCny ?? 0).toFixed(2)}
                  </td>
                  <td className='px-2 py-2'>
                    {((row?.matchedCoverage ?? 0) * 100).toFixed(0)}%
                  </td>
                  <td className='px-2 py-2'>
                    {row?.observedCostMultiplier?.toFixed(4) ?? '-'}
                  </td>
                  <td className='px-2 py-2'>
                    {row?.suggestedMultiplier ?? t('Manual review')}
                  </td>
                  <td className='px-2 py-2'>
                    {draft ? (
                      <Input
                        aria-label={`${model.modelId} ${t('Price multiplier')}`}
                        className='w-24'
                        inputMode='decimal'
                        value={model.multiplier}
                        onChange={(event) =>
                          changeDraft({
                            ...draft,
                            models: draft.models.map((item, position) =>
                              position === index
                                ? { ...item, multiplier: event.target.value }
                                : item
                            ),
                          })
                        }
                      />
                    ) : (
                      model.multiplier || '-'
                    )}
                  </td>
                  <td className='px-2 py-2'>
                    {row?.replayRevenueCny == null
                      ? '-'
                      : `${Number(row.replayRevenueCny).toFixed(2)} (${((row.replayCoverage ?? 0) * 100).toFixed(0)}%)`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <details>
        <summary className='cursor-pointer text-sm'>
          {t('Usage and cost breakdown')}
        </summary>
        <div className='mt-3 overflow-x-auto'>
          <table className='w-full min-w-[760px] text-left text-sm'>
            <thead>
              <tr>
                {[
                  'Model',
                  'Input',
                  'Output',
                  'Cached Input',
                  'Judge cost',
                  'Probe cost',
                  'Recorded margin',
                ].map((label) => (
                  <th className='px-2 py-2 font-medium' key={label}>
                    {t(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {economics.models.map((row) => (
                <tr key={row.model_id} className='border-b'>
                  <th className='px-2 py-2 font-normal'>{row.model_id}</th>
                  <td className='px-2 py-2'>
                    {Number(row.input_tokens ?? 0).toLocaleString()}
                  </td>
                  <td className='px-2 py-2'>
                    {Number(row.output_tokens ?? 0).toLocaleString()}
                  </td>
                  <td className='px-2 py-2'>
                    {Number(row.cached_input_tokens ?? 0).toLocaleString()}
                  </td>
                  <td className='px-2 py-2'>
                    {Number(row.judge_cost_cny ?? 0).toFixed(4)}
                  </td>
                  <td className='px-2 py-2'>
                    {Number(row.probe_cost_cny ?? 0).toFixed(4)}
                  </td>
                  <td className='px-2 py-2'>
                    {(
                      Number(row.totalRevenueCny) -
                      Number(row.totalRecordedCostCny)
                    ).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {draft && (
        <div className='space-y-3'>
          <details>
            <summary className='cursor-pointer text-sm'>
              {t('Reference price snapshot')}
            </summary>
            <Textarea
              aria-label={t('Reference price snapshot')}
              className='mt-2 min-h-48 font-mono text-xs'
              value={references}
              onChange={(event) => {
                setReferences(event.target.value)
                setPendingReferences(true)
                setPreview(null)
                setConfirmed(false)
              }}
            />
            <Button
              variant='outline'
              className='mt-2'
              onClick={() => {
                try {
                  const parsed: unknown = JSON.parse(references)
                  if (
                    !Array.isArray(parsed) ||
                    parsed.length !== draft.models.length ||
                    parsed.some(
                      (model) =>
                        !model ||
                        typeof model !== 'object' ||
                        !draft.models.some(
                          (item) => item.modelId === model.modelId
                        )
                    )
                  ) {
                    throw new Error(t('Invalid model reference snapshot'))
                  }
                  changeDraft({
                    ...draft,
                    models: parsed.map((model) => ({
                      ...model,
                      multiplier:
                        draft.models.find(
                          (item) => item.modelId === model.modelId
                        )?.multiplier ?? '',
                    })),
                  })
                  setReferenceError('')
                  setPendingReferences(false)
                } catch (error) {
                  setReferenceError(
                    error instanceof Error
                      ? error.message
                      : t('Invalid model reference snapshot')
                  )
                }
              }}
            >
              {t('Apply reference snapshot')}
            </Button>
            {referenceError && (
              <p role='alert' className='text-destructive'>
                {referenceError}
              </p>
            )}
          </details>
          <label className='block text-sm'>
            {t('Change reason')}
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className='flex flex-wrap gap-3'>
            <Button
              variant='outline'
              disabled={mutation.isPending || pendingReferences}
              onClick={() => mutation.mutate(false)}
            >
              {t('Preview')}
            </Button>
            <Button
              variant='outline'
              onClick={() => {
                setDraft(null)
                setPreview(null)
              }}
            >
              {t('Cancel')}
            </Button>
          </div>
          {preview && (
            <label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t('Confirm all model multipliers and reference prices')}
            </label>
          )}
          <Button
            disabled={
              !preview ||
              !confirmed ||
              !reason.trim() ||
              mutation.isPending ||
              pendingReferences
            }
            onClick={() => mutation.mutate(true)}
          >
            {t('Schedule price publication')}
          </Button>
        </div>
      )}
      {mutation.isError && (
        <p role='alert' className='text-destructive'>
          {mutation.error.message}
        </p>
      )}
      {cancellation.isError && (
        <p role='alert' className='text-destructive'>
          {cancellation.error.message}
        </p>
      )}
      {!draft && (
        <label className='block text-sm'>
          {t('Change reason')}
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      <ul className='text-muted-foreground space-y-1 text-xs'>
        {data.versions.map((version) => (
          <li key={version.version} className='flex items-center gap-3'>
            {version.version} ·{' '}
            {new Date(version.effective_at).toLocaleString()}
            {version.cancelled_at
              ? ` · ${t('Cancelled')}`
              : new Date(version.effective_at).getTime() > Date.now() && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={!reason.trim() || cancellation.isPending}
                    onClick={() => cancellation.mutate(version.version)}
                  >
                    {t('Cancel scheduled publication')}
                  </Button>
                )}
          </li>
        ))}
      </ul>
    </section>
  )
}

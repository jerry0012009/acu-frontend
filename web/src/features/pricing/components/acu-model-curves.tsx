import { useQuery } from '@tanstack/react-query'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { VChart } from '@visactor/react-vchart'
import type { EventParamsDefinition } from '@visactor/vchart'
import {
  ArrowDownUp,
  BarChart3,
  Check,
  CircleDollarSign,
  Route,
} from 'lucide-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'
import { VCHART_OPTION } from '@/lib/vchart'
import { useAuthStore } from '@/stores/auth-store'
import { getApiKeys } from '@/features/keys/api'

import { getACUSelectionCorridor } from '../api'
import {
  compareQualityAtDifficulty,
  qualityAtDifficulty,
  sortTooltipLinesByQuality,
} from '../lib/curve-ranking'
import {
  executionPresetLabels,
  executionPresetPricingCosts,
} from '../lib/execution-preset-series'
import { formatACUCNY, formatPublicReferenceSource } from '../lib/price'
import {
  PRICE_COLOR_STOPS,
  buildPriceRankColorMap,
  priceRankColor,
} from '../lib/price-rank-color'
import {
  buildPricingCostSpec,
  compareDisplayedCostsDescending,
  displayedPricingCost,
  estimatedPricingCost,
  pricingCostRange,
  type PricingCostDatum,
} from '../lib/pricing-comparison'
import {
  PRICING_PREVIEW_CONTROL_GRID_CLASS,
  corridorEligibleModelIds,
  corridorPointAtDifficulty,
  resolveEffectiveCorridorPreference,
  type CorridorPreference,
} from '../lib/selection-corridor'
import type { PricingDisplayMode, PricingModel } from '../types'

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

type CurveSortMode = 'price' | 'ability'

const CORRIDOR_PREFERENCES: Array<{
  id: CorridorPreference
  label: string
}> = [
  { id: 'economy', label: '省钱' },
  { id: 'balanced', label: '均衡' },
  { id: 'quality', label: '性能' },
]

export function ACUModelCurves(props: {
  models: PricingModel[]
  displayMode: PricingDisplayMode
}) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const currentUser = useAuthStore((state) => state.auth.user)
  const allCurveModels = useMemo(
    () =>
      props.models
        .filter(
          (model) =>
            model.acu_active === true &&
            model.price_currency === 'CNY' &&
            (model.acu_curve?.length ?? 0) > 0
        )
        .sort((left, right) =>
          (left.display_name || left.model_name).localeCompare(
            right.display_name || right.model_name
          )
        ),
    [props.models]
  )
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [inputTokens, setInputTokens] = useState(100_000)
  const [outputTokens, setOutputTokens] = useState(4_000)
  const [sortMode, setSortMode] = useState<CurveSortMode>('price')
  const [corridorPreference, setCorridorPreference] =
    useState<CorridorPreference>('balanced')
  const [previewTokenId, setPreviewTokenId] = useState<number | undefined>()
  const { data: apiKeys } = useQuery({
    queryKey: ['pricing-preview-api-keys', currentUser?.id],
    queryFn: () => getApiKeys({ p: 1, size: 100 }),
    enabled: currentUser != null,
    staleTime: 60_000,
  })
  const [hoveredDifficulty, setHoveredDifficulty] = useState<number | null>(
    null
  )
  const deferredInputTokens = useDeferredValue(inputTokens)
  const deferredOutputTokens = useDeferredValue(outputTokens)
  const { data: selectionCorridor, isError: selectionCorridorUnavailable } =
    useQuery({
      queryKey: [
        'acu-selection-corridor',
        deferredInputTokens,
        deferredOutputTokens,
        previewTokenId,
      ],
      queryFn: () =>
        getACUSelectionCorridor(deferredInputTokens, deferredOutputTokens, previewTokenId),
      staleTime: 60 * 1000,
      retry: 1,
    })
  const executionPresetSeries = useMemo(
    () => selectionCorridor?.executionPresetSeries ?? [],
    [selectionCorridor]
  )
  const curveModels = useMemo(() => {
    if (previewTokenId == null) return allCurveModels
    if (!selectionCorridor) return []
    const eligibleModelIds = corridorEligibleModelIds(selectionCorridor)
    return allCurveModels.filter((model) => eligibleModelIds.has(model.model_name))
  }, [allCurveModels, previewTokenId, selectionCorridor])
  const effectiveCorridorPreference = resolveEffectiveCorridorPreference(
    previewTokenId,
    selectionCorridor,
    corridorPreference
  )
  const isPreviewLoading = previewTokenId != null && !selectionCorridor && !selectionCorridorUnavailable
  const allCandidateIds = useMemo(
    () => [
      ...curveModels.map((model) => model.model_name),
      ...executionPresetSeries.map((preset) => preset.candidateId),
    ],
    [curveModels, executionPresetSeries]
  )
  const abilityDifficulty = hoveredDifficulty ?? 50

  useEffect(() => {
    setSelectedCandidateIds(allCandidateIds)
  }, [allCandidateIds])

  const selectedSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds]
  )
  const orderedCurveModels = useMemo(
    () =>
      [...curveModels].sort((left, right) => {
        if (sortMode === 'ability') {
          return compareQualityAtDifficulty(
            left.acu_curve ?? [],
            right.acu_curve ?? [],
            abilityDifficulty
          )
        }
        const rightCost = displayedPricingCost(
          right,
          props.displayMode,
          inputTokens,
          outputTokens
        )
        const leftCost = displayedPricingCost(
          left,
          props.displayMode,
          inputTokens,
          outputTokens
        )
        return compareDisplayedCostsDescending(leftCost, rightCost)
      }),
    [
      abilityDifficulty,
      curveModels,
      inputTokens,
      outputTokens,
      props.displayMode,
      sortMode,
    ]
  )
  const selectedModels = useMemo(
    () => curveModels.filter((model) => selectedSet.has(model.model_name)),
    [curveModels, selectedSet]
  )
  const selectedPresets = useMemo(
    () =>
      executionPresetSeries.filter((preset) =>
        selectedSet.has(preset.candidateId)
      ),
    [executionPresetSeries, selectedSet]
  )
  const modelNameById = useMemo(
    () =>
      new Map([
        ...curveModels.map(
          (model) =>
            [model.model_name, model.display_name || model.model_name] as const
        ),
        ...executionPresetSeries.map(
          (preset) => [preset.candidateId, preset.displayName] as const
        ),
      ]),
    [curveModels, executionPresetSeries]
  )
  const canonicalModelById = useMemo(
    () => new Map(curveModels.map((model) => [model.model_name, model])),
    [curveModels]
  )
  const candidateDisplayCosts = useMemo(
    () => [
      ...curveModels.map((model) => ({
        id: model.model_name,
        cost: displayedPricingCost(
          model,
          props.displayMode,
          inputTokens,
          outputTokens
        ),
      })),
      ...executionPresetSeries.map((preset) => ({
        id: preset.candidateId,
        cost: executionPresetPricingCosts(
          preset,
          canonicalModelById.get(preset.modelId),
          props.displayMode,
          inputTokens,
          abilityDifficulty
        ).displayCost,
      })),
    ],
    [
      abilityDifficulty,
      canonicalModelById,
      curveModels,
      executionPresetSeries,
      inputTokens,
      outputTokens,
      props.displayMode,
    ]
  )
  const colorByModel = useMemo(
    () => buildPriceRankColorMap(candidateDisplayCosts),
    [candidateDisplayCosts]
  )
  const priceRange = useMemo(
    () => pricingCostRange(candidateDisplayCosts.map((item) => item.cost)),
    [candidateDisplayCosts]
  )

  const curveData = useMemo(
    () => [
      ...selectedModels.flatMap((model) => {
        const displayName = model.display_name || model.model_name
        const cost = displayedPricingCost(
          model,
          props.displayMode,
          inputTokens,
          outputTokens
        )
        return (model.acu_curve ?? []).map((point) => ({
          modelId: model.model_name,
          modelName: displayName,
          difficulty: point.difficultyScore,
          quality: point.estimatedQuality * 100,
          qualityLower: point.qualityLower * 100,
          qualityUpper: point.qualityUpper * 100,
          cost,
        }))
      }),
      ...selectedPresets.flatMap((preset) =>
        preset.points.map((point) => ({
          modelId: preset.candidateId,
          modelName: preset.displayName,
          difficulty: point.difficulty,
          quality: point.estimatedQuality,
          qualityLower: point.estimatedQuality,
          qualityUpper: point.estimatedQuality,
          cost:
            props.displayMode === 'reference_only'
              ? executionPresetPricingCosts(
                  preset,
                  canonicalModelById.get(preset.modelId),
                  props.displayMode,
                  inputTokens,
                  point.difficulty
                ).displayCost
              : point.estimatedCallCost,
        }))
      ),
    ],
    [
      canonicalModelById,
      inputTokens,
      outputTokens,
      props.displayMode,
      selectedModels,
      selectedPresets,
    ]
  )

  const costData = useMemo(
    () =>
      [
        ...selectedModels.map((model): PricingCostDatum => ({
          modelId: model.model_name,
          modelName: model.display_name || model.model_name,
          payableCost: estimatedPricingCost(
            model.payable?.input_cny_per_million,
            model.payable?.output_cny_per_million,
            inputTokens,
            outputTokens
          ),
          referenceCost: estimatedPricingCost(
            model.reference?.input_cny_per_million,
            model.reference?.output_cny_per_million,
            inputTokens,
            outputTokens
          ),
          payableInput: model.payable?.input_cny_per_million,
          payableOutput: model.payable?.output_cny_per_million,
          referenceInput: model.reference?.input_cny_per_million,
          referenceOutput: model.reference?.output_cny_per_million,
          referenceSource: model.reference
            ? formatPublicReferenceSource(
                model.reference,
                t('Official pricing'),
                t('OpenRouter public pricing')
              )
            : undefined,
          referenceObservedAt: model.reference?.observed_at,
          status: model.payable?.status,
          displayCost: displayedPricingCost(
            model,
            props.displayMode,
            inputTokens,
            outputTokens
          ),
          abilityScore:
            qualityAtDifficulty(model.acu_curve ?? [], abilityDifficulty) * 100,
        })),
        ...selectedPresets.flatMap((preset): PricingCostDatum[] => {
          const baseModel = canonicalModelById.get(preset.modelId)
          const costs = executionPresetPricingCosts(
            preset,
            baseModel,
            props.displayMode,
            inputTokens,
            abilityDifficulty
          )
          const point = costs.point
          return point ? [{
            modelId: preset.candidateId,
            modelName: preset.displayName,
            payableCost: costs.payableCost,
            referenceCost: costs.referenceCost,
            referenceInput: baseModel?.reference?.input_cny_per_million,
            referenceOutput: baseModel?.reference?.output_cny_per_million,
            referenceSource: baseModel?.reference
              ? formatPublicReferenceSource(
                  baseModel.reference,
                  t('Official pricing'),
                  t('OpenRouter public pricing')
                )
              : undefined,
            referenceObservedAt: baseModel?.reference?.observed_at,
            status: 'estimated',
            displayCost: costs.displayCost,
            abilityScore: point.estimatedQuality,
          }] : []
        }),
      ]
        .sort((left, right) =>
          sortMode === 'ability'
            ? right.abilityScore - left.abilityScore
            : compareDisplayedCostsDescending(
                left.displayCost,
                right.displayCost
              )
        ),
    [
      abilityDifficulty,
      canonicalModelById,
      inputTokens,
      outputTokens,
      props.displayMode,
      selectedModels,
      selectedPresets,
      sortMode,
      t,
    ]
  )

  const handleDimensionHover = useCallback(
    (event: EventParamsDefinition['dimensionHover']) => {
      if (event.action === 'leave') {
        setHoveredDifficulty(null)
        return
      }
      const value = event.dimensionInfo.find((item) =>
        Number.isFinite(Number(item.value))
      )?.value
      if (value !== undefined) setHoveredDifficulty(Number(value))
    },
    []
  )

  const chartColors = useMemo(
    () => [
      ...selectedModels.map(
        (model) => colorByModel.get(model.model_name) || priceRankColor(0.5)
      ),
      ...selectedPresets.map(
        (preset) => colorByModel.get(preset.candidateId) || priceRankColor(0.5)
      ),
    ],
    [colorByModel, selectedModels, selectedPresets]
  )
  const axisColor =
    resolvedTheme === 'dark' ? 'rgba(255,255,255,0.66)' : 'rgba(15,23,42,0.62)'
  const gridColor =
    resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'

  const corridorData = useMemo(
    () =>
      CORRIDOR_PREFERENCES.map((preference) => ({
        ...preference,
        values: (selectionCorridor?.series[preference.id] ?? []).map(
          (point) => ({ ...point, preference: preference.label })
        ),
      })),
    [selectionCorridor]
  )
  const activeCorridor = useMemo(
    () =>
      corridorData.find((corridor) => corridor.id === effectiveCorridorPreference) ??
      corridorData[1],
    [corridorData, effectiveCorridorPreference]
  )
  const corridorAtHover = useMemo(
    () =>
      corridorPointAtDifficulty(
        selectionCorridor,
        effectiveCorridorPreference,
        abilityDifficulty
      ),
    [abilityDifficulty, effectiveCorridorPreference, selectionCorridor]
  )
  let corridorStatusText = '正在读取当前路由快照'
  if (selectionCorridor) {
    corridorStatusText = `${selectionCorridor.formulaVersion} · 零调用模拟 · ${new Date(
      selectionCorridor.generatedAt
    ).toLocaleTimeString()}`
    if (selectionCorridor.assumptions.workload === 'Codex Agent') {
      corridorStatusText +=
        ' · Codex Agent · Responses API · Function / Custom / Local tools · 无 Provider 托管 Web 要求'
    }
  } else if (selectionCorridorUnavailable) {
    corridorStatusText = '当前路由快照暂不可用'
  }

  const curveSpec = useMemo(
    () => ({
      type: 'common' as const,
      data: [
        {
          id: `acu-corridor-${effectiveCorridorPreference}`,
          values: activeCorridor?.values ?? [],
        },
        { id: 'acu-model-curves', values: curveData },
      ],
      series: [
        {
          type: 'rangeArea' as const,
          zIndex: 0,
          dataIndex: 0,
          xField: 'difficulty',
          yField: ['qualityLower', 'qualityUpper'],
          animation: false,
          area: {
            style: {
              fill: resolvedTheme === 'dark' ? '#94a3b8' : '#64748b',
              fillOpacity: resolvedTheme === 'dark' ? 0.14 : 0.09,
            },
          },
          line: { visible: false },
          tooltip: { visible: false },
        },
        {
          type: 'line' as const,
          zIndex: 10,
          dataIndex: 1,
          xField: 'difficulty',
          yField: 'quality',
          seriesField: 'modelName',
          color: chartColors,
          animation: false,
          line: {
            style: {
              lineWidth: 2,
              stroke: (datum: { modelId?: string }) =>
                colorByModel.get(datum.modelId ?? '') || priceRankColor(0.5),
            },
          },
          point: { visible: false },
        },
      ],
      animation: false,
      legends: { visible: false },
      crosshair: {
        xField: { visible: true, line: { style: { stroke: axisColor } } },
      },
      tooltip: {
        dimension: {
          title: {
            value: (datum: { difficulty: number }) =>
              `${t('Difficulty')} ${Math.round(datum.difficulty)}`,
          },
          content: [
            {
              key: (datum: { modelName: string }) => datum.modelName,
              value: (datum: { quality: number; cost: number }) =>
                `${datum.quality.toFixed(1)} · ${formatACUCNY(datum.cost)}`,
            },
          ],
          updateContent: (
            previous: Array<{ datum?: { quality?: number } }> = []
          ) => sortTooltipLinesByQuality(previous),
        },
      },
      axes: [
        {
          orient: 'bottom' as const,
          type: 'linear' as const,
          title: { visible: true, text: t('Difficulty') },
          min: 0,
          max: 100,
          label: { style: { fill: axisColor, fontSize: 11 } },
          grid: { visible: false },
        },
        {
          orient: 'left' as const,
          title: { visible: true, text: t('Estimated quality') },
          min: 0,
          max: 100,
          label: {
            formatMethod: (value: number | string) => `${value}%`,
            style: { fill: axisColor, fontSize: 11 },
          },
          grid: {
            visible: true,
            style: { stroke: gridColor, lineDash: [3, 3] },
          },
        },
      ],
    }),
    [
      activeCorridor,
      axisColor,
      chartColors,
      colorByModel,
      effectiveCorridorPreference,
      curveData,
      gridColor,
      resolvedTheme,
      t,
    ]
  )

  const costSpec = useMemo(
    () =>
      buildPricingCostSpec(props.displayMode, costData, {
        axisColor,
        gridColor,
        axisTitle: t('Estimated execution cost (CNY)'),
        formatAxisLabel: (value) => formatACUCNY(Number(value), 4),
        colorForDatum: (datum) =>
          colorByModel.get(datum.modelId ?? '') || priceRankColor(0.5),
        tooltip: {
          mark: {
            title: { value: (datum: { modelName: string }) => datum.modelName },
            content: [
              {
                key: t('Current platform estimate'),
                value: (datum: PricingCostDatum) =>
                  datum.payableCost === undefined
                    ? '-'
                    : formatACUCNY(datum.payableCost),
              },
              {
                key: t('Official or public reference'),
                value: (datum: PricingCostDatum) =>
                  datum.referenceCost === undefined
                    ? t('No comparable public reference price')
                    : formatACUCNY(datum.referenceCost),
              },
              {
                key: t('Reference source'),
                value: (datum: PricingCostDatum) =>
                  datum.referenceSource || '-',
              },
              {
                key: t('Updated'),
                value: (datum: PricingCostDatum) =>
                  datum.referenceObservedAt || '-',
              },
              {
                key: t('Price status'),
                value: (datum: PricingCostDatum) =>
                  datum.status === 'verified' ? t('Verified') : t('Estimated'),
              },
            ],
          },
        },
      }),
    [axisColor, colorByModel, costData, gridColor, props.displayMode, t]
  )

  if (curveModels.length === 0 && previewTokenId == null) return null

  return (
    <section className="border-border/70 bg-card/80 overflow-hidden rounded-lg border">
      <div className="border-b px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Route className="text-primary size-4" />
              <h2 className="text-base font-semibold">
                {t('ACU model quality curves')}
              </h2>
            </div>
            <p className="text-muted-foreground mt-1 max-w-3xl text-xs leading-relaxed sm:text-sm">
              {t(
                'Quality is predicted by task difficulty. Current estimates use available routes and billing configuration.'
              )}
            </p>
          </div>
          <div className={PRICING_PREVIEW_CONTROL_GRID_CLASS}>
            {currentUser && (
              <label className="text-muted-foreground col-span-1 text-[11px] font-medium sm:col-span-2 xl:col-span-1">
                {t('Preview API Key')}
                <select
                  className="bg-background mt-1 h-8 w-full rounded-md border px-2 text-sm"
                  value={previewTokenId ?? ''}
                  onChange={(event) =>
                    setPreviewTokenId(event.target.value ? Number(event.target.value) : undefined)
                  }
                >
                  <option value="">{t('Default global routing')}</option>
                  {(apiKeys?.data?.items ?? []).map((key) => (
                    <option key={key.id} value={key.id}>
                      {key.name} · {key.acu_routing_preference || 'balanced'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-muted-foreground text-[11px] font-medium">
              {t('Input tokens')}
              <Input
                className="mt-1 h-8 w-full min-w-0 rounded-md font-mono"
                type="number"
                min={0}
                step={1000}
                value={inputTokens}
                onChange={(event) =>
                  setInputTokens(positiveInteger(event.target.value, 0))
                }
              />
            </label>
            <label className="text-muted-foreground text-[11px] font-medium">
              {t('Expected output tokens')}
              <Input
                className="mt-1 h-8 w-full min-w-0 rounded-md font-mono"
                type="number"
                min={0}
                step={100}
                value={outputTokens}
                onChange={(event) =>
                  setOutputTokens(positiveInteger(event.target.value, 0))
                }
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={
              selectedCandidateIds.length === allCandidateIds.length
                ? 'default'
                : 'outline'
            }
            className="h-7 px-2 text-xs"
            onClick={() => setSelectedCandidateIds(allCandidateIds)}
          >
            {t('All')} {allCandidateIds.length}
          </Button>
          {orderedCurveModels.map((model) => {
            const selected = selectedSet.has(model.model_name)
            return (
              <button
                key={model.model_name}
                type="button"
                onClick={() =>
                  setSelectedCandidateIds((current) =>
                    selected
                      ? current.filter((item) => item !== model.model_name)
                      : [...current, model.model_name]
                  )
                }
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
                  selected
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground opacity-60'
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor:
                      colorByModel.get(model.model_name) || priceRankColor(0.5),
                  }}
                />
                <span className="max-w-44 truncate">
                  {model.display_name || model.model_name}
                </span>
                {sortMode === 'ability' && (
                  <span className="text-muted-foreground font-mono text-[10px]">
                    D{Math.round(abilityDifficulty)} ·{' '}
                    {(
                      qualityAtDifficulty(
                        model.acu_curve ?? [],
                        abilityDifficulty
                      ) * 100
                    ).toFixed(1)}
                    %
                  </span>
                )}
                {selected && <Check className="size-3" />}
              </button>
            )
          })}
          {executionPresetSeries.map((preset) => {
            const selected = selectedSet.has(preset.candidateId)
            return (
              <button
                key={preset.candidateId}
                type="button"
                onClick={() =>
                  setSelectedCandidateIds((current) =>
                    selected
                      ? current.filter((item) => item !== preset.candidateId)
                      : [...current, preset.candidateId]
                  )
                }
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
                  selected
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground opacity-60'
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: colorByModel.get(preset.candidateId) }}
                />
                <span>{preset.displayName}</span>
                <span className="text-muted-foreground hidden text-[9px] sm:inline">
                  {executionPresetLabels(preset).join(' · ')}
                </span>
                {selected && <Check className="size-3" />}
              </button>
            )
          })}
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span>
            {t('Lower estimated cost')} {formatACUCNY(priceRange.minimum)}
          </span>
          <span
            aria-hidden="true"
            className="h-2.5 w-40 rounded-full border sm:w-56"
            style={{
              background: `linear-gradient(90deg, ${PRICE_COLOR_STOPS.join(', ')})`,
            }}
          />
          <span>
            {t('Higher estimated cost')} {formatACUCNY(priceRange.maximum)}
          </span>
        </div>
      </div>

      {/* eslint-disable-next-line no-nested-ternary */}
      {isPreviewLoading ? (
        <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
          {t('Loading routing corridor')}
        </div>
      ) : selectedModels.length + selectedPresets.length === 0 ? (
        <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
          {t('Select at least one model')}
        </div>
      ) : (
        <div className="bg-border/60 grid min-w-0 gap-px xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
          <div className="bg-card min-w-0 p-3 sm:p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="text-muted-foreground size-4" />
                {t('Difficulty and estimated quality')}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <div
                  className="bg-muted/40 inline-flex h-8 items-center rounded-md border p-0.5"
                  role="group"
                  aria-label="ACU Auto 选择模式"
                >
                  {CORRIDOR_PREFERENCES.map((preference) => (
                    <Button
                      key={preference.id}
                      type="button"
                      size="sm"
                      variant={
                        effectiveCorridorPreference === preference.id
                          ? 'secondary'
                          : 'ghost'
                      }
                      className="h-6 px-2 text-xs shadow-none"
                      disabled={previewTokenId != null}
                      title={previewTokenId != null ? t('Determined by selected API Key') : undefined}
                      onClick={() => setCorridorPreference(preference.id)}
                    >
                      {preference.label}
                    </Button>
                  ))}
                </div>
                <div
                  className="bg-muted/40 inline-flex h-8 items-center rounded-md border p-0.5"
                  role="group"
                  aria-label={t('Curve ranking')}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={sortMode === 'price' ? 'secondary' : 'ghost'}
                    className="h-6 gap-1 px-2 text-xs shadow-none"
                    onClick={() => setSortMode('price')}
                  >
                    <CircleDollarSign className="size-3" />
                    {t('Price ranking')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sortMode === 'ability' ? 'secondary' : 'ghost'}
                    className="h-6 gap-1 px-2 text-xs shadow-none"
                    onClick={() => setSortMode('ability')}
                  >
                    <ArrowDownUp className="size-3" />
                    {t('Ability ranking')} · D{Math.round(abilityDifficulty)}
                  </Button>
                </div>
              </div>
            </div>
            <div className="h-[360px] min-w-0 sm:h-[440px]">
              {themeReady && (
                <VChart
                  key={`acu-curves-${resolvedTheme}`}
                  spec={{
                    ...curveSpec,
                    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                    background: 'transparent',
                  }}
                  option={VCHART_OPTION}
                  onDimensionHover={handleDimensionHover}
                />
              )}
            </div>
            <div className="mt-3 border-t pt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium">
                  ACU Auto · {activeCorridor?.label} · D
                  {Math.round(abilityDifficulty)}
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {corridorStatusText}
                </div>
              </div>
              {corridorAtHover ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold">
                      {modelNameById.get(
                        corridorAtHover.selectedCandidateId || corridorAtHover.selectedModelId
                      ) || corridorAtHover.selectedCandidateId ||
                        corridorAtHover.selectedModelId}
                    </span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      预计质量 {corridorAtHover.selectedQuality.toFixed(1)}% ·{' '}
                      {formatACUCNY(corridorAtHover.selectedCostCny)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                    {corridorAtHover.candidates.map((candidate) => (
                      <span
                        key={candidate.candidateId || candidate.modelId}
                        className="inline-flex items-center gap-1"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              colorByModel.get(candidate.candidateId || candidate.modelId) ||
                              priceRankColor(0.5),
                          }}
                        />
                        {modelNameById.get(candidate.candidateId || candidate.modelId) ||
                          candidate.modelId}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-xs">
                  暂无可路由模型
                </div>
              )}
              <p className="text-muted-foreground mt-2 text-[10px] leading-4">
                淡色区域表示当前模式下前三个 Pareto
                前沿候选的质量覆盖范围；模型曲线颜色按实际人民币价格由蓝到紫排列。
                展示 Responses、无工具、基础质量目标 80 的条件结果。
              </p>
            </div>
          </div>

          <div className="bg-card min-w-0 p-3 sm:p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CircleDollarSign className="text-muted-foreground size-4" />
                {t('Estimated execution cost (CNY)')}
              </div>
              <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
                {props.displayMode !== 'reference_only' && (
                  <span className="flex items-center gap-1">
                    <span className="bg-foreground inline-block h-2 w-3 rounded-[1px]" />
                    {t('Current platform estimate')}
                  </span>
                )}
                {props.displayMode !== 'payable_only' && (
                  <span className="flex items-center gap-1">
                    <span className="bg-foreground inline-block h-3 w-3 rounded-[1px] opacity-[0.16]" />
                    {t('Official or public reference')}
                  </span>
                )}
              </div>
            </div>
            <div
              className="min-w-0"
              style={{
                height: Math.max(360, (selectedModels.length + selectedPresets.length) * 34),
              }}
            >
              {themeReady && (
                <VChart
                  key={`acu-costs-${resolvedTheme}`}
                  spec={{
                    ...costSpec,
                    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                    background: 'transparent',
                  }}
                  option={VCHART_OPTION}
                />
              )}
            </div>
            <div className="text-muted-foreground mt-2 border-t pt-3 text-xs leading-relaxed">
              {t(
                'Solid bars show the current platform estimated payment; light bars show official or public market reference costs. Estimates use the input and output tokens above. Actual payment may change with route availability, network status, and price updates. Final billing prevails.'
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

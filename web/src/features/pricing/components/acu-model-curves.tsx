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
import { BarChart3, Check, CircleDollarSign, Route } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChartTheme } from '@/lib/use-chart-theme'
import { cn } from '@/lib/utils'
import { VCHART_OPTION } from '@/lib/vchart'

import { formatACUCNY } from '../lib/price'
import type { PricingModel } from '../types'

const MODEL_COLORS = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#ea580c',
  '#0d9488',
  '#9333ea',
  '#475569',
]

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function estimatedCallCost(
  model: PricingModel,
  inputTokens: number,
  outputTokens: number
): number {
  const inputPrice = model.input_price_per_million ?? 0
  const outputPrice = model.output_price_per_million ?? 0
  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000
}

export function ACUModelCurves(props: { models: PricingModel[] }) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const curveModels = useMemo(
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
  const allModelIds = useMemo(
    () => curveModels.map((model) => model.model_name),
    [curveModels]
  )
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [inputTokens, setInputTokens] = useState(100_000)
  const [outputTokens, setOutputTokens] = useState(4_000)

  useEffect(() => {
    setSelectedModelIds(allModelIds)
  }, [allModelIds])

  const selectedSet = useMemo(
    () => new Set(selectedModelIds),
    [selectedModelIds]
  )
  const selectedModels = useMemo(
    () => curveModels.filter((model) => selectedSet.has(model.model_name)),
    [curveModels, selectedSet]
  )
  const colorByModel = useMemo(
    () =>
      new Map(
        curveModels.map((model, index) => [
          model.model_name,
          MODEL_COLORS[index % MODEL_COLORS.length],
        ])
      ),
    [curveModels]
  )

  const curveData = useMemo(
    () =>
      selectedModels.flatMap((model) => {
        const displayName = model.display_name || model.model_name
        const cost = estimatedCallCost(model, inputTokens, outputTokens)
        return (model.acu_curve ?? []).map((point) => ({
          modelId: model.model_name,
          modelName: displayName,
          difficulty: point.difficultyScore,
          quality: point.estimatedQuality * 100,
          qualityLower: point.qualityLower * 100,
          qualityUpper: point.qualityUpper * 100,
          cost,
          provider: model.acu_cost_provider || '-',
          channel: model.acu_cost_channel || '-',
        }))
      }),
    [inputTokens, outputTokens, selectedModels]
  )

  const costData = useMemo(
    () =>
      selectedModels
        .map((model) => ({
          modelId: model.model_name,
          modelName: model.display_name || model.model_name,
          cost: estimatedCallCost(model, inputTokens, outputTokens),
          inputPrice: model.input_price_per_million ?? 0,
          outputPrice: model.output_price_per_million ?? 0,
          provider: model.acu_cost_provider || '-',
          channel: model.acu_cost_channel || '-',
          status: model.acu_effective_cost_status || 'estimated',
        }))
        .sort((left, right) => left.cost - right.cost),
    [inputTokens, outputTokens, selectedModels]
  )

  const chartColors = selectedModels.map(
    (model) => colorByModel.get(model.model_name) || MODEL_COLORS[0]
  )
  const axisColor =
    resolvedTheme === 'dark' ? 'rgba(255,255,255,0.66)' : 'rgba(15,23,42,0.62)'
  const gridColor =
    resolvedTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'

  const curveSpec = useMemo(
    () => ({
      type: 'line' as const,
      data: [{ id: 'acu-model-curves', values: curveData }],
      xField: 'difficulty',
      yField: 'quality',
      seriesField: 'modelName',
      color: chartColors,
      animation: false,
      line: { style: { lineWidth: 2 } },
      point: { visible: false },
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
        },
      },
      axes: [
        {
          orient: 'bottom' as const,
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
    [axisColor, chartColors, curveData, gridColor, t]
  )

  const costSpec = useMemo(
    () => ({
      type: 'bar' as const,
      direction: 'horizontal' as const,
      data: [{ id: 'acu-model-costs', values: costData }],
      xField: 'cost',
      yField: 'modelName',
      seriesField: 'modelName',
      color: costData.map(
        (item) => colorByModel.get(item.modelId) || MODEL_COLORS[0]
      ),
      animation: false,
      legends: { visible: false },
      bar: { style: { cornerRadius: 3 } },
      tooltip: {
        mark: {
          title: { value: (datum: { modelName: string }) => datum.modelName },
          content: [
            {
              key: t('Estimated execution cost'),
              value: (datum: { cost: number }) => formatACUCNY(datum.cost),
            },
            {
              key: `${t('Input')} / 1M`,
              value: (datum: { inputPrice: number }) =>
                formatACUCNY(datum.inputPrice),
            },
            {
              key: `${t('Output')} / 1M`,
              value: (datum: { outputPrice: number }) =>
                formatACUCNY(datum.outputPrice),
            },
            {
              key: t('Provider'),
              value: (datum: { provider: string }) => datum.provider,
            },
            {
              key: t('Channel'),
              value: (datum: { channel: string }) => datum.channel,
            },
          ],
        },
      },
      axes: [
        {
          orient: 'bottom' as const,
          title: { visible: true, text: t('Estimated execution cost (CNY)') },
          label: {
            formatMethod: (value: number | string) =>
              formatACUCNY(Number(value), 4),
            style: { fill: axisColor, fontSize: 11 },
          },
          grid: {
            visible: true,
            style: { stroke: gridColor, lineDash: [3, 3] },
          },
        },
        {
          orient: 'left' as const,
          label: { style: { fill: axisColor, fontSize: 11 }, autoLimit: true },
        },
      ],
    }),
    [axisColor, colorByModel, costData, gridColor, t]
  )

  if (curveModels.length === 0) return null

  return (
    <section className='border-border/70 bg-card/80 overflow-hidden rounded-lg border'>
      <div className='border-b px-4 py-4 sm:px-5'>
        <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <Route className='text-primary size-4' />
              <h2 className='text-base font-semibold'>
                {t('ACU model quality curves')}
              </h2>
            </div>
            <p className='text-muted-foreground mt-1 max-w-3xl text-xs leading-relaxed sm:text-sm'>
              {t(
                'Quality is predicted by task difficulty. CNY prices use the current reference execution profile and real provider cash conversion.'
              )}
            </p>
          </div>
          <div className='grid shrink-0 grid-cols-2 gap-2 sm:w-auto'>
            <label className='text-muted-foreground text-[11px] font-medium'>
              {t('Input tokens')}
              <Input
                className='mt-1 h-8 w-full min-w-0 font-mono sm:w-32'
                type='number'
                min={0}
                step={1000}
                value={inputTokens}
                onChange={(event) =>
                  setInputTokens(positiveInteger(event.target.value, 0))
                }
              />
            </label>
            <label className='text-muted-foreground text-[11px] font-medium'>
              {t('Expected output tokens')}
              <Input
                className='mt-1 h-8 w-full min-w-0 font-mono sm:w-32'
                type='number'
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

        <div className='mt-4 flex flex-wrap gap-1.5'>
          <Button
            type='button'
            size='sm'
            variant={
              selectedModelIds.length === allModelIds.length
                ? 'default'
                : 'outline'
            }
            className='h-7 px-2 text-xs'
            onClick={() => setSelectedModelIds(allModelIds)}
          >
            {t('All')} {allModelIds.length}
          </Button>
          {curveModels.map((model) => {
            const selected = selectedSet.has(model.model_name)
            return (
              <button
                key={model.model_name}
                type='button'
                onClick={() =>
                  setSelectedModelIds((current) =>
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
                  className='size-2 rounded-full'
                  style={{
                    backgroundColor:
                      colorByModel.get(model.model_name) || MODEL_COLORS[0],
                  }}
                />
                <span className='max-w-44 truncate'>
                  {model.display_name || model.model_name}
                </span>
                {selected && <Check className='size-3' />}
              </button>
            )
          })}
        </div>
      </div>

      {selectedModels.length === 0 ? (
        <div className='text-muted-foreground flex h-56 items-center justify-center text-sm'>
          {t('Select at least one model')}
        </div>
      ) : (
        <div className='bg-border/60 grid min-w-0 gap-px xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]'>
          <div className='bg-card min-w-0 p-3 sm:p-5'>
            <div className='mb-2 flex items-center gap-2 text-sm font-medium'>
              <BarChart3 className='text-muted-foreground size-4' />
              {t('Difficulty and estimated quality')}
            </div>
            <div className='h-[360px] min-w-0 sm:h-[440px]'>
              {themeReady && (
                <VChart
                  key={`acu-curves-${resolvedTheme}`}
                  spec={{
                    ...curveSpec,
                    theme: resolvedTheme === 'dark' ? 'dark' : 'light',
                    background: 'transparent',
                  }}
                  option={VCHART_OPTION}
                />
              )}
            </div>
          </div>

          <div className='bg-card min-w-0 p-3 sm:p-5'>
            <div className='mb-2 flex items-center gap-2 text-sm font-medium'>
              <CircleDollarSign className='text-muted-foreground size-4' />
              {t('Estimated execution cost (CNY)')}
            </div>
            <div
              className='min-w-0'
              style={{ height: Math.max(360, selectedModels.length * 34) }}
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
            <div className='text-muted-foreground mt-2 border-t pt-3 text-xs leading-relaxed'>
              {t(
                'Marketplace cost is a pre-request estimate. Final historical cost uses the settled user charge in CNY.'
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

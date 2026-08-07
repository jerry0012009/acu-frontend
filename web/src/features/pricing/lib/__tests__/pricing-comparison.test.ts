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
import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { PricingModel } from '../../types'
import {
  buildPricingBarSeries,
  buildPricingCostSpec,
  compareDisplayedCostsDescending,
  displayedPricingCost,
  estimatedPricingCost,
  pricingCostRange,
} from '../pricing-comparison.ts'

const specOptions = {
  axisColor: '#111',
  gridColor: '#ddd',
  axisTitle: 'Estimated execution cost (CNY)',
  formatAxisLabel: (value: number | string) => `¥${value}`,
  colorForDatum: () => '#369',
  tooltip: { mark: { content: [] } },
}

const model = {
  id: 1,
  model_name: 'model-a',
  quota_type: 0,
  model_ratio: 0,
  completion_ratio: 0,
  enable_groups: ['default'],
  payable: {
    input_cny_per_million: 2,
    output_cny_per_million: 10,
    status: 'estimated',
    pricing_policy_version: 'acu-retail-v1',
  },
  payable_by_protocol: {
    responses: {
      input_cny_per_million: 1,
      output_cny_per_million: 5,
      status: 'estimated',
      pricing_policy_version: 'acu-retail-v1',
    },
    messages: {
      input_cny_per_million: 4,
      output_cny_per_million: 20,
      status: 'verified',
      pricing_policy_version: 'acu-retail-v1',
    },
  },
  reference: {
    input_cny_per_million: 7.2,
    output_cny_per_million: 14.4,
    source_type: 'official',
    source_name: 'Vendor official pricing',
    observed_at: '2026-08-02',
    original_currency: 'USD',
  },
} satisfies PricingModel

test('payable_only renders one payable series', () => {
  assert.deepEqual(
    buildPricingBarSeries('payable_only').map((series) => series.id),
    ['payable-price']
  )
})

test('reference_only renders one reference series', () => {
  assert.deepEqual(
    buildPricingBarSeries('reference_only').map((series) => series.id),
    ['reference-price']
  )
})

test('comparison overlays reference and payable bars on one shared axis', () => {
  const series = buildPricingBarSeries('comparison')
  assert.equal(series.length, 2)
  assert.deepEqual(
    series.map((item) => item.dataIndex),
    [0, 0]
  )
  assert.deepEqual(
    series.map((item) => item.regionIndex),
    [0, 0]
  )
  assert.deepEqual(
    series.map((item) => item.yField),
    ['modelName', 'modelName']
  )
  assert.deepEqual(
    {
      xField: series[0].xField,
      opacity: series[0].opacity,
      zIndex: series[0].zIndex,
    },
    { xField: 'referenceCost', opacity: 0.12, zIndex: 1 }
  )
  assert.deepEqual(
    {
      xField: series[1].xField,
      opacity: series[1].opacity,
      zIndex: series[1].zIndex,
    },
    { xField: 'payableCost', opacity: 1, zIndex: 2 }
  )
  assert.equal(series[0].barMinHeight, 1)
  assert.equal(series[1].barMinHeight, 3)
  assert.ok(series.every((item) => !('barGap' in item)))
  assert.ok(series.every((item) => !('barWidth' in item)))
})

test('comparison spec restores the old horizontal axes and overlays both series', () => {
  const spec = buildPricingCostSpec('comparison', [], specOptions)
  assert.equal(spec.direction, 'horizontal')
  assert.deepEqual(
    spec.axes.map((axis) => ({
      orient: axis.orient,
      type: axis.type,
      regionIndex: axis.regionIndex,
      seriesIndex: axis.seriesIndex,
    })),
    [
      { orient: 'bottom', type: 'linear', regionIndex: 0, seriesIndex: [0, 1] },
      { orient: 'left', type: 'band', regionIndex: 0, seriesIndex: [0, 1] },
    ]
  )
  assert.equal(spec.axes[0].min, 0)
  assert.deepEqual(
    spec.series.map((series) => ({
      xField: series.xField,
      yField: series.yField,
      dataIndex: series.dataIndex,
      regionIndex: series.regionIndex,
    })),
    [
      {
        xField: 'referenceCost',
        yField: 'modelName',
        dataIndex: 0,
        regionIndex: 0,
      },
      {
        xField: 'payableCost',
        yField: 'modelName',
        dataIndex: 0,
        regionIndex: 0,
      },
    ]
  )
})

test('single-series modes preserve the old horizontal bar structure', () => {
  for (const mode of ['payable_only', 'reference_only'] as const) {
    const spec = buildPricingCostSpec(mode, [], specOptions)
    assert.equal(spec.direction, 'horizontal')
    assert.equal(spec.axes[0].type, 'linear')
    assert.equal(spec.axes[1].type, 'band')
    assert.equal(spec.series.length, 1)
    assert.equal(spec.series[0].yField, 'modelName')
    assert.ok(!('barWidth' in spec.series[0]))
  }
  assert.equal(
    buildPricingCostSpec('payable_only', [], specOptions).series[0].xField,
    'payableCost'
  )
  assert.equal(
    buildPricingCostSpec('reference_only', [], specOptions).series[0].xField,
    'referenceCost'
  )
})

test('comparison keeps the payable bar when a model has no reference', () => {
  const datum = {
    modelId: 'payable-only-model',
    modelName: 'Payable Only Model',
    payableCost: 1.25,
    referenceCost: undefined,
    displayCost: 1.25,
    abilityScore: 80,
  }
  const spec = buildPricingCostSpec('comparison', [datum], specOptions)
  assert.equal(spec.data[0].values[0].payableCost, 1.25)
  assert.equal(spec.data[0].values[0].referenceCost, undefined)
  assert.equal(spec.series[1].xField, 'payableCost')
})

test('comparison sorts by payable and reference_only sorts by reference', () => {
  assert.equal(displayedPricingCost(model, 'comparison', 1_000_000, 100_000), 3)
  assert.ok(
    Math.abs(
      displayedPricingCost(model, 'reference_only', 1_000_000, 100_000) - 8.64
    ) < 1e-12
  )
})

test('protocol views select backend payable prices while all keeps the backend compatibility price', () => {
  assert.equal(displayedPricingCost(model, 'comparison', 1_000_000, 100_000, 'all'), 3)
  assert.equal(displayedPricingCost(model, 'comparison', 1_000_000, 100_000, 'responses'), 1.5)
  assert.equal(displayedPricingCost(model, 'comparison', 1_000_000, 100_000, 'messages'), 6)
})

test('models without a comparable reference sort after priced models', () => {
  assert.ok(compareDisplayedCostsDescending(8.64, Number.POSITIVE_INFINITY) < 0)
  assert.ok(compareDisplayedCostsDescending(Number.POSITIVE_INFINITY, 8.64) > 0)
})

test('both costs recalculate from the same input and output token values', () => {
  assert.equal(estimatedPricingCost(2, 10, 1_000_000, 100_000), 3)
  assert.ok(
    Math.abs(
      (estimatedPricingCost(7.2, 14.4, 1_000_000, 100_000) ?? 0) - 8.64
    ) < 1e-12
  )
  assert.equal(estimatedPricingCost(2, 10, 2_000_000, 200_000), 6)
  assert.equal(
    estimatedPricingCost(undefined, undefined, 1_000_000, 100_000),
    undefined
  )
})

test('includes execution preset display costs in the shared price range', () => {
  assert.deepEqual(pricingCostRange([0.1, 0.2, 0.8, 0.4]), {
    minimum: 0.1,
    maximum: 0.8,
  })
})

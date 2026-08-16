import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { Window } from 'happy-dom'
import * as React from 'react'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'

import type { LogOtherData } from '../../types'
import { AcuDecisionVisualization } from './details-dialog'

const explanation = `The complete Judge explanation must remain available. ${'evidence '.repeat(50)}`
const breakdown: NonNullable<LogOtherData['acu_cost_breakdown']> = {
  difficulty: 72,
  routing_preference: 'balanced',
  phase: 'execution',
  selected_model: 'gpt-5.6-terra',
  actual_provider: 'CloseAI',
  channel_id: 'closeai-openai-primary',
  billing_multiplier: 0.18,
  actual_total_cash_cost_cny: 0.12,
  counterfactual_quality_ceiling_cost_cny: 0.2,
  judge_explanation: explanation,
  channel_attempts: [
    {
      attempt_index: 1,
      provider: 'Lucen',
      channel: 'lucen-a',
      status: 'failed',
      error_category: 'timeout',
    },
    {
      attempt_index: 2,
      provider: 'CloseAI',
      channel: 'closeai-openai-primary',
      status: 'success',
    },
  ],
  route_decision: {
    difficulty: 72,
    phase: 'execution',
    routing_preference: 'balanced',
    curve_version: 'fixture-curves-v1',
    price_version: 'fixture-prices-v1',
    routing_formula_version: 'acu-routing-model-v0.3',
    candidate_estimates: [
      {
        modelId: 'gpt-5.6-terra',
        displayName: 'Terra',
        estimatedQuality: 91,
        expectedTotalCost: 0.12,
        paretoEfficient: true,
      },
      {
        modelId: 'gpt-5.6-sol',
        displayName: 'Sol',
        estimatedQuality: 96,
        expectedTotalCost: 0.2,
        paretoEfficient: true,
      },
      {
        modelId: 'gpt-5.4-mini',
        displayName: 'Mini',
        estimatedQuality: 82,
        expectedTotalCost: 0.08,
        paretoEfficient: false,
      },
    ],
    pareto_frontier: ['gpt-5.6-terra', 'gpt-5.6-sol'],
    curves: {
      'gpt-5.6-terra': Array.from({ length: 101 }, (_, difficulty) => ({
        difficulty,
        estimatedQuality: 98 - difficulty * 0.1,
      })),
      'gpt-5.6-sol': Array.from({ length: 101 }, (_, difficulty) => ({
        difficulty,
        estimatedQuality: 99 - difficulty * 0.04,
      })),
      'gpt-5.4-mini': Array.from({ length: 101 }, (_, difficulty) => ({
        difficulty,
        estimatedQuality: 94 - difficulty * 0.16,
      })),
    },
    decision_snapshot: {
      selectedModel: 'gpt-5.6-terra',
      modelSelectionReason:
        'Best balanced value on the historical Pareto frontier.',
      channelSelectionReason: 'First healthy compatible channel.',
    },
    excluded_profiles: [
      { executionProfileId: 'profile-mini', exclusionReason: 'context_window' },
    ],
  },
}
const routeDecision = breakdown.route_decision
if (!routeDecision) {
  throw new Error('ACU route decision fixture is required')
}

let window: Window

before(() => {
  window = new Window({ url: 'http://localhost/' })
  const resizeObserver = class {
    private readonly callback: (entries: unknown[]) => void

    constructor(callback: (entries: unknown[]) => void) {
      this.callback = callback
    }

    observe(target: Element) {
      this.callback([
        {
          target,
          contentRect: { width: 900, height: 400 },
        },
      ])
    }

    unobserve() {}
    disconnect() {}
  }
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    React,
    ResizeObserver: resizeObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.assign(window, { ResizeObserver: resizeObserver })
  Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 900,
      bottom: 400,
      left: 0,
      width: 900,
      height: 400,
      toJSON: () => ({}),
    }),
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: window.navigator,
  })
})

after(() => window.close())

test('renders the complete historical ACU route decision fixture', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(
      createElement(AcuDecisionVisualization, {
        route: routeDecision,
        breakdown,
        other: {
          actual_provider: 'CloseAI',
          actual_channel: 'closeai-openai-primary',
        },
        actualModel: 'gpt-5.6-terra',
        isAdmin: true,
      })
    )
  })

  const content = host.textContent ?? ''
  assert.match(content, /Terra/)
  assert.match(content, /Sol/)
  assert.match(content, /Mini/)
  assert.match(
    content,
    /Dominated by another option with higher quality and lower cost/
  )
  assert.match(
    content,
    /Higher quality, but the marginal cost increases materially/
  )
  assert.match(host.innerHTML, /Terra/)
  assert.match(host.innerHTML, /91\.0/)
  assert.match(host.innerHTML, /¥0\.120000/)
  assert.match(content, /Pareto/)
  assert.match(content, /Channel Attempt Timeline/)
  assert.match(content, /lucen-a/)
  assert.match(content, /closeai-openai-primary/)
  assert.match(content, /Estimated quality is a curve estimate/)
  assert.match(content, /profile-mini/)
  assert.ok(
    host.innerHTML.includes(explanation),
    'Judge explanation must not be truncated'
  )

  await act(async () => root.unmount())
})

test('keeps execution-preset candidates distinct when modelId is shared', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const presetCandidates = [
    {
      candidateId: 'gpt-5.6-sol',
      modelId: 'gpt-5.6-sol',
      displayName: 'GPT-5.6 Sol',
      estimatedQuality: 0.91,
      expectedTotalCost: 0.12,
      paretoEfficient: true,
    },
    {
      candidateId: 'gpt-5.6-sol@high',
      modelId: 'gpt-5.6-sol',
      displayName: 'GPT-5.6 Sol · High',
      estimatedQuality: 0.94,
      expectedTotalCost: 0.16,
      paretoEfficient: true,
    },
    {
      candidateId: 'gpt-5.6-sol@xhigh',
      modelId: 'gpt-5.6-sol',
      displayName: 'GPT-5.6 Sol · XHigh',
      estimatedQuality: 0.97,
      expectedTotalCost: 0.21,
      paretoEfficient: true,
    },
  ]
  const presetRoute = {
    ...routeDecision,
    selected_profile: { modelId: 'gpt-5.6-sol' },
    candidate_estimates: presetCandidates,
    pareto_frontier: presetCandidates.map((candidate) => candidate.candidateId),
    curves: {
      'gpt-5.6-sol': [{ difficulty: 72, estimatedQuality: 94 }],
    },
    decision_snapshot: {
      ...routeDecision.decision_snapshot,
      selectedModel: 'gpt-5.6-sol',
      selectedCandidateId: 'gpt-5.6-sol@high',
      candidates: presetCandidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        modelId: candidate.modelId,
        displayName: candidate.displayName,
        effectiveCashCost: candidate.expectedTotalCost,
      })),
    },
  }

  await act(async () => {
    root.render(
      createElement(AcuDecisionVisualization, {
        route: presetRoute,
        breakdown: {
          ...breakdown,
          route_decision: presetRoute,
          selected_model: 'gpt-5.6-sol',
        },
        other: {},
        actualModel: 'gpt-5.6-sol',
        isAdmin: true,
      })
    )
  })

  const rows = [...host.querySelectorAll('[class*="py-1.5"]')].map(
    (row) => row.textContent ?? ''
  )
  assert.equal(rows.length, 3)
  assert.match(rows[0] ?? '', /GPT-5\.6 Sol/)
  assert.doesNotMatch(rows[0] ?? '', /Selected/)
  assert.match(rows[1] ?? '', /GPT-5\.6 Sol · High/)
  assert.match(rows[1] ?? '', /Selected/)
  assert.match(rows[2] ?? '', /GPT-5\.6 Sol · XHigh/)
  assert.doesNotMatch(rows[2] ?? '', /Selected/)

  await act(async () => root.unmount())
  host.remove()
})

test('hides provider, channel, and profile identities for ordinary users', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  await act(async () => {
    root.render(
      createElement(AcuDecisionVisualization, {
        route: routeDecision,
        breakdown,
        other: {
          actual_provider: 'CloseAI',
          actual_channel: 'closeai-openai-primary',
        },
        actualModel: 'gpt-5.6-terra',
      })
    )
  })

  const content = host.textContent ?? ''
  assert.match(
    content,
    new RegExp(
      publicChannelAlias('CloseAI', 'closeai-openai-primary').replaceAll(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )
    )
  )
  assert.doesNotMatch(
    content,
    /CloseAI|Lucen|closeai-openai-primary|lucen-a|profile-mini/
  )

  await act(async () => root.unmount())
  host.remove()
})

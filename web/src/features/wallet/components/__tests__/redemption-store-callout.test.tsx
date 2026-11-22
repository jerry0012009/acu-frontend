import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const React = await import('react')
const { act } = React
;(globalThis as typeof globalThis & { React?: unknown }).React =
  React.default ?? React
const { createRoot } = await import('react-dom/client')
const i18next = (await import('i18next')).default
const { initReactI18next } = await import('react-i18next')
await i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Buy a redemption code': 'Buy a redemption code',
        'Purchase in the ACU store, then return here and redeem it.':
          'Purchase in the ACU store, then return here and redeem it.',
        'Buy a redemption code (opens in a new tab)':
          'Buy a redemption code (opens in a new tab)',
        'Open ACU store': 'Open ACU store',
      },
    },
  },
})
const { RedemptionStoreCallout } = await import('../redemption-store-callout')
const { RechargeFormCard } = await import('../recharge-form-card')

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

test('opens the configured redemption store in a safe new tab', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <RedemptionStoreCallout purchaseUrl='https://pay.ldxp.cn/shop/ACU' />
    )
  })

  const link = container.querySelector('a')
  assert.ok(link)
  assert.equal(link.href, 'https://pay.ldxp.cn/shop/ACU')
  assert.equal(link.target, '_blank')
  assert.equal(link.rel, 'noopener noreferrer')
  assert.equal(
    link.getAttribute('aria-label'),
    'Buy a redemption code (opens in a new tab)'
  )
  assert.match(container.textContent ?? '', /ACU store/)
  assert.equal(container.querySelector('iframe'), null)

  await act(async () => root.unmount())
  container.remove()
})

after(() => domWindow.close())

test('redemption-only wallet omits direct payment and submits a pasted code', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let submissions = 0
  let code = ''
  const render = async (redeeming = false) => {
    await act(async () => {
      root.render(
        <RechargeFormCard
          topupInfo={{
            enable_online_topup: false,
            enable_stripe_topup: false,
            enable_redemption: true,
            pay_methods: [],
            amount_options: [],
            discount: {},
            min_topup: 1,
            stripe_min_topup: 1,
          }}
          presetAmounts={[]}
          selectedPreset={null}
          onSelectPreset={() => {}}
          topupAmount={0}
          onTopupAmountChange={() => {}}
          paymentAmount={0}
          calculating={false}
          onPaymentMethodSelect={() => {}}
          paymentLoading={null}
          redemptionCode={code}
          onRedemptionCodeChange={(value) => {
            code = value
          }}
          onRedeem={() => {
            submissions += 1
          }}
          redeeming={redeeming}
          topupLink='https://pay.ldxp.cn/shop/ACU'
        />
      )
    })
  }

  try {
    await render()
    assert.doesNotMatch(
      container.textContent ?? '',
      /Choose an amount|Online topup is not enabled/
    )
    assert.ok(container.querySelector('a[href="https://pay.ldxp.cn/shop/ACU"]'))
    assert.equal(
      container.querySelector('label')?.textContent,
      'Enter your redemption code'
    )
    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )
    assert.ok(submit?.disabled)

    code = '  fixture-code  '
    await render()
    assert.equal(submit.disabled, false)
    await act(async () => submit.click())
    assert.equal(submissions, 1)

    await render(true)
    assert.ok(submit.disabled)
    assert.equal(container.querySelector('input')?.disabled, true)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import i18next from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { initReactI18next } from 'react-i18next'

import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import {
  createPreferenceExample,
  shouldShowPreferenceExample,
} from '../preference-example'
import { PreferenceStarfishChart } from '../preference-starfish'

await i18next
  .use(initReactI18next)
  .init({ lng: 'en', fallbackLng: 'en', resources: { en, zh } })

test('only a confirmed empty personal profile is eligible for the example', () => {
  assert.equal(shouldShowPreferenceExample(undefined), false)
  for (const status of ['queued', 'generating', 'error', 'ready'] as const) {
    assert.equal(
      shouldShowPreferenceExample({
        status,
        profile: null,
        generatedAt: null,
        error: null,
      }),
      false
    )
  }
  assert.equal(
    shouldShowPreferenceExample({
      status: 'empty',
      profile: null,
      generatedAt: null,
      error: null,
    }),
    true
  )
  const populated = createPreferenceExample(i18next.t)
  assert.equal(
    shouldShowPreferenceExample({ ...populated, status: 'empty' }),
    false
  )
})

test('example shows fifty distinct illustrative directions without personal sources or evidence scores', () => {
  const view = createPreferenceExample(i18next.t)
  assert.equal(view.profile?.rays.length, 50)
  assert.equal(new Set(view.profile?.rays.map((ray) => ray.id)).size, 50)
  assert.equal(new Set(view.profile?.rays.map((ray) => ray.category)).size, 5)
  assert(view.profile?.rays.every((ray) => ray.sourceIds.length === 0))
  const html = renderToStaticMarkup(
    <PreferenceStarfishChart view={view} example />
  )
  assert.match(html, /Example data, not your personal preferences/)
  assert.match(html, /Example preference details/)
  assert.equal(
    (html.match(/class="preference-starfish-ray"/g) || []).length,
    50
  )
  assert.doesNotMatch(
    html,
    /Saved preference records|Evidence confidence estimate|Preference strength estimate/
  )
})

test('example labels and disclaimer follow the selected language', async () => {
  await i18next.changeLanguage('zh')
  try {
    const html = renderToStaticMarkup(
      <PreferenceStarfishChart
        view={createPreferenceExample(i18next.t)}
        example
      />
    )
    assert.match(html, /示例数据，非你的个人偏好/)
    assert.match(html, /示例偏好详情/)
    assert.match(html, /界面与视觉表达/)
  } finally {
    await i18next.changeLanguage('en')
  }
})

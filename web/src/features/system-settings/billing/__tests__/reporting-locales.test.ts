import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createInstance } from 'i18next'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

const reportingKeys = [
  'Reporting coverage',
  'Matched coverage',
  'Replay coverage',
  'Replay revenue',
  'Recorded cost excludes fixed infrastructure and payment fees.',
  'Missing historical reporting summaries do not mean zero cost. Recorded revenue and cost totals are retained; matched and replay coverage may be incomplete.',
  'Replay revenue covers only replayable requests, not the full period total.',
  'Reference type',
  'Platform reference',
  'OpenRouter reference',
  'Reference currency',
  'Reference unit prices',
  'Reference amount (CNY)',
  'Input accounting mode',
  'Input includes cached tokens',
  'Input excludes cached tokens',
  'Billed Uncached Input Tokens',
  'View cost reference',
  'Legacy quota conversion',
  'Usage unavailable',
  'Fixed retail price',
  'Relative to platform reference',
  'Legacy cost-plus markup',
  'USD credits (not cash)',
  'Supplier cost and legacy cost-plus simulation only; this is not the current fixed retail price.',
  'Legacy cost-plus simulation',
  'Estimated supplier cost',
  'Routing cost estimate, not the user charge.',
  'Supplier cost factor',
  'Not the user model multiplier.',
  'Supplier cost factor range only; this does not change the user model multiplier.',
  'Model multiplier',
  'Price version',
  'USD/CNY',
] as const

for (const [language, resource] of Object.entries({
  en,
  zh,
  fr,
  ja,
  ru,
  vi,
  zhTW,
})) {
  test(`${language} provides bounded reporting labels and warnings without missing translations`, async () => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: 'en',
      resources: { en, [language]: resource },
    })
    const translations: Record<string, string> = resource.translation
    for (const key of reportingKeys) {
      assert.ok(translations[key]?.trim(), `${language} is missing ${key}`)
      assert.equal(i18n.t(key), translations[key])
      if (language === 'zh') assert.notEqual(i18n.t(key), key)
    }
  })
}

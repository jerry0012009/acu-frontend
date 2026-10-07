import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { PRICING_CURVE_PROTOCOL_OPTIONS } from '../selection-corridor'

test('Pricing opens in Chat and offers only the three concrete protocols', () => {
  assert.deepEqual(
    PRICING_CURVE_PROTOCOL_OPTIONS.map((option) => option.id),
    ['chat_completions', 'responses', 'messages']
  )
  for (const language of ['en', 'zh']) {
    const resources = JSON.parse(
      readFileSync(
        new URL(`../../../../i18n/locales/${language}.json`, import.meta.url),
        'utf8'
      )
    ) as { translation: Record<string, string> }
    assert.deepEqual(
      PRICING_CURVE_PROTOCOL_OPTIONS.map(
        (option) => resources.translation[option.labelKey]
      ),
      ['Chat', 'Responses', 'Messages']
    )
  }
})

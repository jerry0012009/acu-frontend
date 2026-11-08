import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('published GPT-6 model metadata enables native Codex image tools', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../../../../public/codex-acu-model-catalog.json', import.meta.url), 'utf8'))
  for (const slug of ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna']) {
    assert.deepEqual(catalog.models.find(model => model.slug === slug).input_modalities, ['text', 'image'], `${slug} must not block view_image`)
  }
  assert.deepEqual(catalog.models.find(model => model.slug === 'glm-5.3').input_modalities, ['text'])
})

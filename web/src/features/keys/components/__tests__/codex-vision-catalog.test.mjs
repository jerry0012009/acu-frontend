import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('all published models keep their declared image capability', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../../../../public/codex-acu-model-catalog.json', import.meta.url), 'utf8'))
  assert.equal(catalog.acu_catalog_revision, 'image-capabilities-20261109')
  const visionModels = [
    'acu-auto', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra',
    'gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'deepseek-v4.1-flash-1017',
    'deepseek-v4.1-flash', 'claude-opus-5-5', 'claude-fable-5', 'claude-fable-5-1',
    'claude-sonnet-5', 'claude-opus-4-8', 'glm-5.3-flash',
  ]
  assert.deepEqual(catalog.models.map(model => model.slug).sort(), [...visionModels, 'glm-5.3'].sort())
  for (const slug of visionModels) {
    assert.deepEqual(catalog.models.find(model => model.slug === slug).input_modalities, ['text', 'image'], `${slug} must not block image tools`)
  }
  assert.deepEqual(catalog.models.find(model => model.slug === 'glm-5.3').input_modalities, ['text'])
})

test('Claude Unix and PowerShell expose the same models without a fictitious vision switch', () => {
  const unix = readFileSync(new URL('../../../../../public/claude-acu-install.sh', import.meta.url), 'utf8')
  const windows = readFileSync(new URL('../../../../../public/claude-acu-install.ps1', import.meta.url), 'utf8')
  const shellSettings = JSON.parse(unix.match(/cat >"\$model_settings_tmp" <<'EOF'\n([\s\S]*?)\nEOF/)[1])
  const windowsSettings = JSON.parse(windows.match(/'(\{"availableModels":\[.*?\]\})'/)[1])
  const catalog = JSON.parse(readFileSync(new URL('../../../../../public/codex-acu-model-catalog.json', import.meta.url), 'utf8'))
  const expected = catalog.models.map(model => model.slug).sort()
  assert.deepEqual(shellSettings.availableModels.toSorted(), expected)
  assert.deepEqual(windowsSettings.availableModels.toSorted(), expected)
  assert.deepEqual(Object.keys(shellSettings), ['availableModels'])
  assert.deepEqual(Object.keys(windowsSettings), ['availableModels'])
  for (const installer of [unix, windows]) {
    assert.doesNotMatch(installer, /SUPPORTED_CAPABILITIES[^\n]*(?:vision|image)|DISABLE_(?:VISION|IMAGE)/i)
  }
})

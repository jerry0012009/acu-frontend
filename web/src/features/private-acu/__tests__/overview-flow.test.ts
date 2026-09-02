import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const overviewSource = readFileSync(
  new URL('../private-acu-workspace.tsx', import.meta.url),
  'utf8'
)

test('Private ACU overview presents the shared backbone and both learning paths', () => {
  assert.match(overviewSource, /function SharedLearningBackbone\(\)/)
  assert.match(overviewSource, /function LearningFlowLane\(/)
  assert.match(overviewSource, /function StepPrompt\(/)
  assert.match(overviewSource, /function promptStateForCards\(/)
  assert.match(overviewSource, /title=\{t\('LLM call learning'\)\}/)
  assert.match(overviewSource, /title=\{t\('Film POC learning'\)\}/)
  assert.match(overviewSource, /getPrivateACUPrompts/)
  assert.match(overviewSource, /Prompt available/)

  for (const stage of [
    'Input',
    'Evidence',
    'Experience',
    'Learning',
    'Quality Skill',
  ]) {
    assert.match(overviewSource, new RegExp(`t\\('${stage}'\\)`))
  }
})

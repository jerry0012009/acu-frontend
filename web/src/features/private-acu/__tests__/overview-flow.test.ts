import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const overviewSource = readFileSync(
  new URL('../private-acu-workspace.tsx', import.meta.url),
  'utf8'
)
const adminSource = readFileSync(
  new URL(
    '../../dashboard/components/admin/private-acu-admin.tsx',
    import.meta.url
  ),
  'utf8'
)
const examplesSource = readFileSync(
  new URL('../prompt-examples.tsx', import.meta.url),
  'utf8'
)

test('Private ACU overview presents the shared backbone and both learning paths', () => {
  assert.match(overviewSource, /function SharedLearningBackbone\(\)/)
  assert.match(overviewSource, /function LearningFlowLane\(/)
  assert.match(overviewSource, /function StepPrompt\(/)
  assert.match(overviewSource, /function promptStateForCards\(/)
  assert.match(overviewSource, /<Dialog/)
  assert.match(overviewSource, /data-testid='step-prompt-details'/)
  assert.match(overviewSource, /View step details/)
  assert.match(overviewSource, /StepPrompt stepTitle=\{step.title\}/)
  assert.match(overviewSource, /title=\{t\('LLM call learning'\)\}/)
  assert.match(overviewSource, /title=\{t\('Film POC learning'\)\}/)
  assert.match(overviewSource, /getPrivateACUPrompts/)
  assert.match(overviewSource, /Prompt available/)
  assert.match(overviewSource, /PromptExamples/)
  assert.match(overviewSource, /learningExamples/)

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

test('Private ACU prompts view includes the resolved film prompt cards', () => {
  assert.match(adminSource, /getPrivateACUFilmStatus/)
  assert.match(adminSource, /function FilmPromptCardsSection\(/)
  assert.match(adminSource, /t\('Film POC prompts'\)/)
  assert.match(adminSource, /t\('View full prompt'\)/)
  assert.match(adminSource, /cards=\{filmPromptsQuery\.data\?\.promptCards\}/)
  assert.match(adminSource, /PromptExamples/)
})

test('Prompt example details present both material and artifact views', () => {
  assert.match(examplesSource, /Material example/)
  assert.match(examplesSource, /Artifact example/)
  assert.match(examplesSource, /material\.images/)
  assert.match(examplesSource, /artifact\.content/)
  assert.match(examplesSource, /Captured run/)
})

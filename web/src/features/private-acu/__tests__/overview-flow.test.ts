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
  assert.match(overviewSource, /getPrivateACULearningRuns/)
  assert.match(overviewSource, /getPrivateACULearningRunDetail/)
  assert.match(overviewSource, /function LearningRunSummary\(/)
  assert.match(overviewSource, /function SkillChangeExamples\(/)
  assert.match(overviewSource, /parseDistilledClaimPreviews/)
  assert.match(overviewSource, /diffAddedLines/)
  assert.match(overviewSource, /Change spotlight/)
  assert.match(overviewSource, /New learning rules/)
  assert.match(overviewSource, /Distillation highlights/)
  assert.match(overviewSource, /skillChangeCount/)
  assert.match(overviewSource, /descriptionBefore/)
  assert.match(overviewSource, /descriptionAfter/)
  assert.match(overviewSource, /SelectionExperience with team judgment/)
  assert.match(
    overviewSource,
    /Film POC records evidence inside SelectionExperience/
  )
  assert.doesNotMatch(overviewSource, /filmEvidenceExamples/)
  assert.match(overviewSource, /materialHint/)
  assert.match(overviewSource, /artifactHint/)
  assert.match(overviewSource, /hideArtifact: true/)
  assert.match(overviewSource, /Prompt available/)
  assert.match(overviewSource, /PromptExamples/)
  assert.match(overviewSource, /learningExamples/)
  assert.match(overviewSource, /account-learning-runs/)
  assert.match(overviewSource, /accountRunExamples/)
  assert.match(overviewSource, /Actual request input/)
  assert.match(overviewSource, /Captured Agent Context/)
  assert.match(overviewSource, /Distillation output/)
  assert.match(
    overviewSource,
    /This Experience produced the following Skill updates/
  )

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

test('Private ACU prompts view presents runtime prompts by learning path', () => {
  assert.match(adminSource, /getPrivateACUFilmStatus/)
  assert.match(adminSource, /function RuntimePromptCardsSection\(/)
  assert.match(adminSource, /accountRuntimeCards/)
  assert.match(adminSource, /account-learning-judge/)
  assert.match(adminSource, /Effective account learning prompts/)
  assert.match(adminSource, /Full runtime prompt/)
  assert.match(adminSource, /Account learning runtime prompts/)
  assert.match(adminSource, /t\('Film POC prompts'\)/)
  assert.match(adminSource, /cards=\{filmPromptsQuery\.data\?\.promptCards\}/)
  assert.match(
    adminSource,
    /Acontext implementation source \(developer reference\)/
  )
  assert.doesNotMatch(adminSource, /t\('Acontext internal prompts'\)/)
  assert.match(adminSource, /PromptExamples/)
})

test('Prompt example details present both material and artifact views', () => {
  assert.match(examplesSource, /Material example/)
  assert.match(examplesSource, /Artifact example/)
  assert.match(examplesSource, /material\.images/)
  assert.match(examplesSource, /artifact\.content/)
  assert.match(examplesSource, /Captured run/)
  assert.match(examplesSource, /hideArtifact/)
  assert.match(examplesSource, /materialLabel/)
  assert.match(examplesSource, /artifactLabel/)
  assert.match(examplesSource, /Captured case/)
  assert.match(examplesSource, /Captured input/)
  assert.match(examplesSource, /Captured output/)
})

test('account run examples read the production messages context shape', () => {
  assert.match(overviewSource, /input\?: unknown; messages\?: unknown/)
  assert.match(
    overviewSource,
    /\(parsed as \{ messages\?: unknown \}\)\.messages/
  )
})

test('overview prompt cards only show prompts that actually execute', () => {
  assert.match(
    overviewSource,
    /card\.execution === 'used' && card\.stage !== 'task'/
  )
})

test('overview keeps an audited account case instead of drifting to the newest run', () => {
  assert.match(
    overviewSource,
    /FEATURED_ACCOUNT_LEARNING_RUN_ID[\s\S]*run_d2c5c5a4f42d4321b2318e3fabb584ef/
  )
  assert.match(overviewSource, /featuredAccountRun \?\?/)
  assert.match(
    overviewSource,
    /getPrivateACULearningRuns\(50, 'user_dissatisfaction'\)/
  )
  assert.match(overviewSource, /Production database migration rework/)
})

test('account distillation renders reusable rules from Task Analysis output', () => {
  assert.match(overviewSource, /field\('Goal'\)/)
  assert.match(overviewSource, /field\('Applies When'\)/)
  assert.match(overviewSource, /field\('Prevention Principle'\)/)
  assert.match(overviewSource, /Reusable rule/)
  assert.match(overviewSource, /Preference rules/)
  assert.match(overviewSource, /Preference rule/)
})

test('the featured account case is reused across input evidence and skill output', () => {
  assert.match(overviewSource, /accountJudgeRunExamples/)
  assert.match(overviewSource, /Original request/)
  assert.match(overviewSource, /Previous answer/)
  assert.match(overviewSource, /User correction/)
  assert.match(overviewSource, /feedback_reason/)
  assert.match(overviewSource, /caseTitle=\{props\.prompt\.caseTitle\}/)
})

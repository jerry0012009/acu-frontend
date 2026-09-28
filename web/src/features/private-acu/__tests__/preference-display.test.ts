import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  preferenceDisplayText,
  preferenceDocumentLabel,
} from '../preference-display'

test('legacy product terminology is adapted in customer reading views', () => {
  assert.equal(
    preferenceDisplayText(
      'Skill Learner\nAvailable Skills\n# 用户偏好Skill\nSKILL.md'
    ),
    'Preference Writer\nAvailable Preferences\n# 用户偏好Preference\nPREFERENCE.md'
  )
})

test('technical keys are adapted only in their displayed copy', () => {
  const original = JSON.stringify({
    relevant_skill_ids: ['id-123'],
    skillChangeCount: 1,
    skillsBefore: [{ path: 'SKILL.md' }],
  })
  assert.equal(
    preferenceDisplayText(original),
    '{"relevant_preference_ids":["id-123"],"preferenceChangeCount":1,"preferencesBefore":[{"path":"PREFERENCE.md"}]}'
  )
  assert.equal(JSON.parse(original).skillsBefore[0].path, 'SKILL.md')
})

test('document aliases leave reading paths and distinct attachments unchanged', () => {
  const files = [{ path: 'SKILL.md' }, { path: 'references/skill-notes.md' }]
  assert.equal(preferenceDocumentLabel(files[0].path, '偏好文档'), '偏好文档')
  assert.equal(
    preferenceDocumentLabel(files[1].path, '偏好文档'),
    'references/preference-notes.md'
  )
  assert.equal(files[0].path, 'SKILL.md')
  assert.equal(files[1].path, 'references/skill-notes.md')
})

test('display adaptation preserves diff markers and does not match unrelated words', () => {
  assert.equal(
    preferenceDisplayText(
      '- Skill old\n+ Skill new\n skilled upskill skillful\n'
    ),
    '- Preference old\n+ Preference new\n skilled upskill skillful\n'
  )
  assert.equal(preferenceDisplayText(''), '')
})

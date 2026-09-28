import assert from 'node:assert/strict'
import { test } from 'node:test'

import i18next from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { initReactI18next } from 'react-i18next'

import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import { PrivateACUSkillCatalog } from '../../dashboard/components/admin/private-acu-skill-catalog'
import { PromptExamples } from '../prompt-examples'

await i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en, zh },
  interpolation: { escapeValue: false },
})

test('legacy catalog renders preference labels while preserving source paths', () => {
  const skills = [
    {
      id: 'stable-id',
      name: 'quality-skill',
      description: 'Quality Skill',
      files: [
        {
          path: 'SKILL.md',
          mime: 'text/markdown',
          content: '# Quality Skill\nEvidence: exp-123',
        },
      ],
    },
  ]
  const html = renderToStaticMarkup(<PrivateACUSkillCatalog skills={skills} />)
  assert.doesNotMatch(html, /skill/i)
  assert.match(html, /Preference document/)
  assert.match(html, /exp-123/)
  assert.equal(skills[0].files[0].path, 'SKILL.md')
  assert.equal(skills[0].files[0].content, '# Quality Skill\nEvidence: exp-123')
})

test('empty catalog translates the preference empty state without skill terminology', async () => {
  await i18next.changeLanguage('zh')
  const html = renderToStaticMarkup(<PrivateACUSkillCatalog skills={[]} />)
  assert.match(html, /暂无偏好文档/)
  assert.doesNotMatch(html, /skill/i)
  await i18next.changeLanguage('en')
})

test('prompt artifacts adapt generated terminology without rewriting captured user input', () => {
  const html = renderToStaticMarkup(
    <PromptExamples
      examples={[
        {
          id: 'example-1',
          title: 'Skill output',
          origin: 'captured_run',
          material: { text: 'My user input mentions skillful work.' },
          artifact: { format: 'markdown', content: '# Skill\nSKILL.md' },
        },
      ]}
    />
  )
  assert.match(html, /Preference output/)
  assert.match(html, /# Preference/)
  assert.match(html, /PREFERENCE.md/)
  assert.match(html, /My user input mentions skillful work./)
  assert.doesNotMatch(html, /SKILL\.md|# Skill/)
})

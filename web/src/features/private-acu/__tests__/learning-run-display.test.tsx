import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import i18next from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { initReactI18next } from 'react-i18next'

import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import { AcontextSourceFiles } from '../../dashboard/components/admin/private-acu-admin'
import {
  LearningRunDetail,
  PreferenceDocumentIdentity,
} from '../private-acu-user-pages'

await i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en, zh },
  interpolation: { escapeValue: false },
})

describe('preference document reading views', () => {
  test('implementation source adapts legacy paths and content without mutating originals', () => {
    const files = [
      {
        path: 'SKILL.md',
        mime: 'text/markdown',
        content: '# Skill\nSkill Learner',
      },
      {
        path: 'references/skill-notes.md',
        mime: 'text/markdown',
        content: 'Available Skills',
      },
    ]
    const html = renderToStaticMarkup(<AcontextSourceFiles files={files} />)
    assert.doesNotMatch(html, /skill/i)
    assert.match(html, /Preference document/)
    assert.match(html, /references\/preference-notes.md/)
    assert.match(html, /Preference Writer/)
    assert.deepEqual(files[0], {
      path: 'SKILL.md',
      mime: 'text/markdown',
      content: '# Skill\nSkill Learner',
    })
  })

  test('learning detail adapts filenames, before, after and diff while preserving source data', () => {
    const detail = {
      runId: 'run-display-regression',
      learningKind: 'user_dissatisfaction',
      status: 'completed',
      receivedAt: '2026-09-18T08:00:00Z',
      elementCount: 1,
      skillChangeCount: 1,
      preferenceChangeCount: 1,
      distillation: {
        distilled_context: 'Failure: Skill terminology visible.',
      },
      skillChanges: [
        {
          skillId: 'stable-id',
          name: 'user-facing-rendered-quality-acceptance',
          descriptionBefore: 'Skill quality',
          descriptionAfter: 'Skill quality acceptance',
          changeType: 'updated',
          files: [
            {
              path: 'SKILL.md',
              before: '# Skill\nPrefer evidence.',
              after: '# Skill\nPrefer rendered evidence.',
              diff: '- Skill: evidence\n+ Skill: rendered evidence',
            },
          ],
        },
      ],
    }
    const original = JSON.stringify(detail)
    const html = renderToStaticMarkup(
      <LearningRunDetail detail={detail} loading={false} error={false} />
    )
    assert.doesNotMatch(html, /skill/i)
    assert.match(html, /Preference document/)
    assert.match(html, /# Preference\nPrefer evidence\./)
    assert.match(html, /# Preference\nPrefer rendered evidence\./)
    assert.match(html, /- Preference: evidence/)
    assert.match(html, /\+ Preference: rendered evidence/)
    assert.equal(JSON.stringify(detail), original)
  })

  test('learning detail lists every changed document with its original ID before the long summary', () => {
    const detail = {
      runId: 'run-identity',
      status: 'completed',
      learningKind: 'user_dissatisfaction',
      receivedAt: '2026-09-18T08:00:00Z',
      elementCount: 1,
      skillChangeCount: 2,
      preferenceChangeCount: 2,
      distillation: { distilled_context: 'Long learning summary' },
      skillChanges: [
        {
          skillId: 'id-quality',
          name: 'quality-acceptance',
          changeType: 'updated',
          files: [],
        },
        {
          skillId: 'id-evidence',
          name: 'evidence-calibration',
          changeType: 'created',
          files: [],
        },
      ],
    }
    const html = renderToStaticMarkup(
      <LearningRunDetail detail={detail} loading={false} error={false} />
    )
    assert.match(html, /Changed documents/)
    assert.match(html, /2 documents/)
    assert.match(html, /id-quality/)
    assert.match(html, /id-evidence/)
    assert.ok(
      html.indexOf('Changed documents') < html.indexOf('Long learning summary')
    )
    assert.match(html, /aria-label="Copy document ID: id-quality"/)
    assert.match(html, /aria-label="Copy document ID: id-evidence"/)
  })

  test('learning detail with no document changes does not render an empty identity list', () => {
    const html = renderToStaticMarkup(
      <LearningRunDetail
        loading={false}
        error={false}
        detail={{
          runId: 'run-empty',
          status: 'completed',
          learningKind: 'user_dissatisfaction',
          receivedAt: '2026-09-18T08:00:00Z',
          elementCount: 0,
          skillChangeCount: 0,
          preferenceChangeCount: 0,
          distillation: {},
          skillChanges: [],
        }}
      />
    )
    assert.match(html, /0 documents/)
    assert.match(html, /No real Preference MD changes/)
    assert.doesNotMatch(html, /Changed documents|Copy document ID/)
  })

  test('document identity without an ID shows a placeholder and no copy action', () => {
    const html = renderToStaticMarkup(<PreferenceDocumentIdentity id='' />)
    assert.match(html, /Document ID/)
    assert.doesNotMatch(html, /<button|Copy document ID/)
  })

  test('document counts use singular and plural in English and document units in Chinese', async () => {
    assert.equal(
      i18next.t('Preference document count', { count: 1 }),
      '1 document'
    )
    assert.equal(
      i18next.t('Preference document count', { count: 2 }),
      '2 documents'
    )
    await i18next.changeLanguage('zh')
    try {
      assert.equal(i18next.t('Documents changed'), '变更文档数')
      assert.equal(
        i18next.t('Preference document count', { count: 2 }),
        '2 个文档'
      )
      const html = renderToStaticMarkup(
        <PreferenceDocumentIdentity id='original-id' />
      )
      assert.match(html, /文档 ID/)
      assert.match(html, /复制文档 ID：original-id/)
    } finally {
      await i18next.changeLanguage('en')
    }
  })
})

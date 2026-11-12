import assert from 'node:assert/strict'
import { test } from 'node:test'

import i18next from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { initReactI18next } from 'react-i18next'

import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import { PreferenceActivityList } from '../preference-activity'
import { PreferenceRecordList } from '../preference-records'

await i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en, zh },
  interpolation: { escapeValue: false },
})

test('source selection shows readable matched records without displaying internal IDs', () => {
  const html = renderToStaticMarkup(
    <PreferenceRecordList
      sourceIds={['internal-1', 'missing']}
      records={[
        { id: 'internal-1', summary: 'Prefer evidence before conclusions' },
        { id: 'unrelated', summary: 'Not selected' },
      ]}
    />
  )
  assert.match(html, /Prefer evidence before conclusions/)
  assert.match(html, /Some source records have no readable summary/)
  assert.doesNotMatch(html, /internal-1|Not selected/)
})

test('unavailable source summary stays empty instead of substituting an identifier', () => {
  const html = renderToStaticMarkup(
    <PreferenceRecordList sourceIds={['missing-id']} records={[]} />
  )
  assert.match(html, /No readable preference records available/)
  assert.doesNotMatch(html, /missing-id/)
})

test('recent changes show complete summaries and keep previous text collapsed', () => {
  const html = renderToStaticMarkup(
    <PreferenceActivityList
      activity={{
        version: 1,
        inspectedRuns: 1,
        moreAvailable: true,
        partial: false,
        events: [
          {
            runId: 'internal-run',
            trigger: 'explicit_user_preference',
            recordedAt: '2026-11-12T12:00:00Z',
            changes: [
              {
                preferenceId: 'internal-pref',
                kind: 'updated',
                before: 'Brief reports',
                after: 'Conclusions first, then evidence <script>',
              },
            ],
          },
        ],
      }}
    />
  )
  assert.match(html, /Explicit preference/)
  assert.match(html, /Conclusions first, then evidence &lt;script&gt;/)
  assert.match(html, /Previous summary/)
  assert.doesNotMatch(
    html,
    /<details[^>]*open|internal-run|internal-pref|<script>/
  )
  assert.match(html, /not a complete history/)
})

test('empty partial activity does not claim that no learning happened', () => {
  const html = renderToStaticMarkup(
    <PreferenceActivityList
      activity={{
        version: 1,
        events: [],
        inspectedRuns: 1,
        partial: true,
        moreAvailable: false,
      }}
    />
  )
  assert.match(html, /No displayable summary changes in recent learning/)
  assert.match(html, /Some recent records could not be loaded/)
})

test('Chinese preference reading labels resolve from the runtime translation namespace', async () => {
  await i18next.changeLanguage('zh')
  try {
    const html = renderToStaticMarkup(
      <PreferenceActivityList
        activity={{
          version: 1,
          events: [],
          inspectedRuns: 0,
          moreAvailable: false,
          partial: false,
        }}
      />
    )
    assert.match(html, /近期学习中暂无可展示的摘要变化/)
    assert.equal(i18next.t('Search preferences'), '搜索偏好')
  } finally {
    await i18next.changeLanguage('en')
  }
})

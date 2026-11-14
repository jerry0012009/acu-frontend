import assert from 'node:assert/strict'
import { test } from 'node:test'

import i18next from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { initReactI18next } from 'react-i18next'

import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import { TeamPreferenceGraph } from '../team-preferences'

await i18next
  .use(initReactI18next)
  .init({ lng: 'zh', fallbackLng: 'en', resources: { en, zh } })
test('team data renders with the existing graph and never requests personal source records', () => {
  const html = renderToStaticMarkup(
    <TeamPreferenceGraph
      space={{
        key: 'GYZ',
        view: {
          status: 'ready',
          generatedAt: null,
          error: null,
          profile: {
            summary: '团队取舍',
            rays: [
              {
                id: 'ray',
                label: '保留夜景暗区',
                category: '光影组织',
                score: 80,
                confidence: 70,
                summary: '局部光池',
                scope: '低照度夜景',
                sourceIds: ['team'],
              },
            ],
            excluded: [],
            sourceCount: 1,
          },
        },
        records: [{ id: 'team', summary: '团队经验来源' }],
      }}
    />
  )
  assert.match(html, /GYZ 创作向量/)
  assert.match(html, /团队经验来源/)
  assert.match(html, /preference-starfish-ray/)
  assert.doesNotMatch(html, /不是用户原话|Saved interpretations|启发式/)
  assert(html.indexOf('<svg') < html.indexOf('<details'))
})
test('empty team space does not fabricate a chart', () => {
  const html = renderToStaticMarkup(
    <TeamPreferenceGraph
      space={{
        key: 'GYZ',
        view: {
          status: 'empty',
          profile: null,
          generatedAt: null,
          error: null,
        },
        records: [],
      }}
    />
  )
  assert.match(html, /暂无创作经验/)
  assert.doesNotMatch(html, /<svg/)
})

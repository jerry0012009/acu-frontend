// Human-reviewed, non-identifying descriptions from the read-only sample review.
// Fixture timestamps and account are synthetic; this is not a live account view.
export const preferenceRecords = [
  { id: 'fixture-quality', summary: '面向用户展示规划、交付或内容返工时，以内容支撑充分和用户呈现合适作为实施前提，并以真实呈现、完整用户视角、价值语义一致性和返工复查作为最终质量验收标准。' },
  { id: 'fixture-install', summary: '面向终端用户交付软件或浏览器扩展时，以可直接安装、可分发和真实启动验证作为主要验收标准；已明确授权的插件试用应默认具备指定核心能力与可用接入配置。' },
  { id: 'fixture-evidence', summary: '面向终端用户解释建议、推荐、审计或自动化决策时，以人可读的依据名称和可直达的详情入口支持理解与核查。' },
]

export const preferenceActivity = {
  version: 1, inspectedRuns: 6, moreAvailable: true, partial: false,
  events: [
    { runId: 'fixture-run-quality', trigger: 'user_dissatisfaction', recordedAt: '2026-11-12T12:47:00Z', changes: [{ preferenceId: 'fixture-quality', kind: 'updated', before: '面向用户展示交付或内容返工时，以真实呈现、完整用户视角、价值语义一致性和返工复查作为最终质量验收标准。', after: preferenceRecords[0].summary }] },
    { runId: 'fixture-run-install', trigger: 'user_dissatisfaction', recordedAt: '2026-11-12T11:58:00Z', changes: [{ preferenceId: 'fixture-install', kind: 'updated', before: '面向终端用户交付软件或浏览器扩展时，以可直接安装、可分发和真实启动验证作为主要验收标准。', after: preferenceRecords[1].summary }] },
  ],
}

export function preferenceFixture(path) {
  const user = { id: 42, role: 1, username: 'preference-preview', display_name: 'Preview', status: 1, language: 'zh', setting: '{}' }
  if (path.endsWith('/setup')) return { status: true, root_init: true }
  if (path.endsWith('/auth/refresh')) return { access_token: 'fixture-only', token_type: 'Bearer', access_expires_at: 9999999999, user, session: { sid: 'fixture', current: true, login_method: 'fixture', ip: '', user_agent: '', created_at: 1, last_active_at: 1, expires_at: 9999999999 } }
  if (path.endsWith('/self')) return user
  if (path.endsWith('/status')) return { system_name: 'ACU Preview', setup: true, version: 'local-preview' }
  if (path.endsWith('/acu-preference-library')) return { version: 1, records: preferenceRecords }
  if (path.endsWith('/acu-preference-controls')) return { records: preferenceRecords.map(record => ({ ...record, rule:'保留已认可的设计',scope: '面向用户的交付',exceptions:'用户明确要求改版时除外', disabled: false, revision: 'a'.repeat(64) })) }
  if (path.endsWith('/acu-preference-activity')) return preferenceActivity
  if (path.endsWith('/acu-preference-profile')) return { status: 'ready', generatedAt: '2026-11-12T12:51:00Z', error: null, profile: { summary: '注重可核验的交付、清晰的依据与直接可用的结果。', rays: preferenceRecords.map((record, index) => ({ id: record.id, label: ['真实呈现验收', '直接安装使用', '依据可读可查'][index], summary: record.summary, category: '交付与核验', score: 70 + index * 5, confidence: 75, scope: '面向用户的交付', sourceIds: [record.id] })), sourceCount: 3, excluded: [] } }
  if (path.endsWith('/acu-memory')) return { enabled: true, skills: [] }
  if (path.endsWith('/acu-advisor/settings')) return { globalEnabled: true, learningEnabled: true }
  if (path.endsWith('/acu-private-usage')) return { windows: [] }
  if (path.endsWith('/notifications')) return { notifications: [], unreadCount: 0 }
  return ''
}

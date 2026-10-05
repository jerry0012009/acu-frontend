import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const directory = process.env.ACU_VISUAL_DATA_DIR
if (!directory) {
  throw new Error('Set ACU_VISUAL_DATA_DIR to the replay artifact directory')
}
const replay = JSON.parse(
  readFileSync(path.join(directory, 'timeline.json'), 'utf8')
)
const monitor = JSON.parse(
  readFileSync(path.join(directory, 'monitor.json'), 'utf8')
)
const routingCatalog = {
  catalogVersion: monitor.catalogVersion,
  models: monitor.modelPool ?? [],
  profiles: monitor.profiles ?? [],
  defaultCandidatePreferenceScores:
    monitor.defaultCandidatePreferenceScores ?? {},
}
const executions = replay.data.items.filter(
  (item) => item.pointType === 'execution'
)
const users = new Map()
for (const item of executions) {
  users.set(item.userId, (users.get(item.userId) ?? 0) + 1)
}
const userId = Number(
  process.env.ACU_VISUAL_USER_ID || [...users].sort((a, b) => b[1] - a[1])[0][0]
)
const items = replay.data.items
  .filter((item) => item.userId === userId)
  .map((item) => ({
    ...item,
    userId: undefined,
    username: undefined,
    actualCashCostCny: undefined,
    actualCostCny: undefined,
    providerCostCny: undefined,
    judgeCostCny: undefined,
    failedAttemptCostCny: undefined,
    failedJudgeAttemptCostCny: undefined,
    judgeAttempts: [],
    providerAttempts: [],
  }))
const from = Math.min(...items.map((item) => item.timestamp))
const to = Math.max(...items.map((item) => item.timestamp))
const timeline = { ...replay, data: { ...replay.data, from, to, items } }
const user = {
  id: userId,
  username: 'preview',
  display_name: 'Preview',
  role: 10,
  status: 1,
  group: 'default',
  language: 'zh',
  setting: '{}',
}
const port = Number(process.env.ACU_VISUAL_API_PORT || 4190)

// This localhost-only server replays evidence. It never forwards mutations
// or credentials to production.
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`)
  const reply = (data, status = 200) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify(data))
  }
  if (url.pathname === '/__visual/timeline') {
    return reply({
      from,
      to,
      requests: items.filter((item) => item.pointType === 'execution').length,
    })
  }
  if (url.pathname === '/api/user/auth/refresh') {
    const expires = Math.floor(Date.now() / 1000) + 86400
    return reply({
      success: true,
      data: {
        access_token: 'local-readonly-preview',
        token_type: 'Bearer',
        access_expires_at: expires,
        user,
        session: {
          sid: 'local-preview',
          current: true,
          login_method: 'preview',
          ip: '127.0.0.1',
          user_agent: 'preview',
          created_at: expires - 86400,
          last_active_at: expires - 86400,
          expires_at: expires,
        },
      },
    })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return reply({ success: false, message: 'Read-only preview' }, 405)
  }
  if (url.pathname === '/api/log/self/acu-work-timeline') return reply(timeline)
  if (url.pathname === '/api/user/self') {
    return reply({ success: true, data: user })
  }
  if (url.pathname === '/api/user/self/acu-routing-catalog') {
    return reply({ success: true, data: routingCatalog })
  }
  if (url.pathname === '/api/setup') {
    return reply({ success: true, data: { status: true } })
  }
  if (url.pathname === '/api/status') {
    return reply({
      success: true,
      data: {
        system_name: 'ACU',
        version: 'quality-preview',
        setup: true,
        quota_per_unit: 500000,
        display_in_currency: true,
      },
    })
  }
  if (url.pathname === '/api/notice') return reply({ success: true, data: '' })
  return reply({ success: true, data: [] })
})
server.listen(port, '127.0.0.1', () => {
  console.log(
    `Read-only actual-log replay API on http://127.0.0.1:${port}, ${items.length} points`
  )
})

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const output = process.env.ACU_VISUAL_DATA_DIR
if (!output) {
  throw new Error('Set ACU_VISUAL_DATA_DIR to a private artifact directory')
}
mkdirSync(output, { recursive: true, mode: 0o700 })

function container(name) {
  return JSON.parse(
    execFileSync('docker', ['inspect', name], { encoding: 'utf8' })
  )[0]
}

function environment(info) {
  return Object.fromEntries(
    info.Config.Env.map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    })
  )
}

const db = environment(container('acu-router-alpha-postgres-newapi-1'))
const sql = `
SELECT COALESCE(json_agg(row_to_json(sample)), '[]'::json)
FROM (
  SELECT id, user_id, created_at, type, model_name, prompt_tokens, completion_tokens, other
  FROM logs
  WHERE created_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days')
    AND other LIKE '%acu_logical_request_id%'
    AND other::jsonb->'acu_cost_breakdown'->>'requested_model' IN ('acu-auto', 'acu-high')
  ORDER BY created_at DESC, id DESC
  LIMIT 100
) sample;`
const logs = JSON.parse(
  execFileSync(
    'docker',
    [
      'exec',
      'acu-router-alpha-postgres-newapi-1',
      'psql',
      '-U',
      db.POSTGRES_USER,
      '-d',
      db.POSTGRES_DB,
      '-At',
      '-c',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
)
if (!logs.length) throw new Error('No recent routed execution logs available')
logs.sort((a, b) => a.created_at - b.created_at || a.id - b.id)
writeFileSync(path.join(output, 'logs.json'), JSON.stringify(logs), {
  mode: 0o600,
})

const router = container('acu-router-alpha-acu-router-1')
const env = environment(router)
const adminToken = env.ACU_ADMIN_TRACE_TOKEN
if (!adminToken) throw new Error('Router admin read token is not configured')
const address = Object.values(router.NetworkSettings.Networks)[0].IPAddress
const response = await fetch(
  `http://${address}:8403/internal/admin/channel-monitor?range=24h&supplyStrategy=balanced&scenario=standard&probeRange=48h&protocol=all`,
  {
    headers: { Authorization: `Bearer ${adminToken}` },
    signal: AbortSignal.timeout(45000),
  }
)
if (!response.ok) {
  throw new Error(`Read-only catalog request returned ${response.status}`)
}
const monitor = await response.json()
writeFileSync(path.join(output, 'monitor.json'), JSON.stringify(monitor), {
  mode: 0o600,
})
console.log(
  JSON.stringify({
    directory: output,
    logs: logs.length,
    from: logs[0].created_at,
    to: logs.at(-1).created_at,
    models: monitor.modelPool?.length ?? 0,
  })
)

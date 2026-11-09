import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getPrivateACULearningRunDetail as selfDetail } from '@/features/dashboard/advisor-api'
import {
  getPrivateACULearningRunDetail as adminDetail,
  getPrivateACUExperienceDetail,
} from '@/features/dashboard/private-acu-admin-api'
import { getACUSessionTrace } from '@/features/usage-logs/api'
import { api } from '@/lib/api'

test('detail requests have bounded waits and learning starts with summary while full evidence stays available', async () => {
  const original = api.defaults.adapter
  const requests: Array<{ url?: string; timeout?: number }> = []
  api.defaults.adapter = async (config) => {
    requests.push({ url: config.url, timeout: config.timeout })
    return {
      data: { success: true, data: { runId: 'run-42' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
  try {
    await adminDetail('run-42')
    await adminDetail('run-42', true)
    await selfDetail('run-42')
    await getPrivateACUExperienceDetail('42', 'request-42')
    await getACUSessionTrace('request-42')
    assert.equal(
      requests[0].url,
      '/api/admin/acu-private/learning-runs/run-42?view=summary'
    )
    assert.equal(requests[1].url, '/api/admin/acu-private/learning-runs/run-42')
    assert(
      requests.every(
        (request) =>
          (request.timeout ?? 0) > 0 && (request.timeout ?? Infinity) <= 30_000
      )
    )
  } finally {
    api.defaults.adapter = original
  }
})

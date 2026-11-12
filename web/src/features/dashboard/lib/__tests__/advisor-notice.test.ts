import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { PrivateACUAdvisorNotification } from '../../advisor-api'
import { advisorNoticePresentation } from '../advisor-notice'

const notification: PrivateACUAdvisorNotification = {
  id: 1,
  advisorId: 'one',
  status: 'risk',
  problemSummary: 'raw private detail',
  adviceSummary: 'raw advice',
  referenceStatus: 'injected',
  targetPath: '/private-acu/advisor',
  sourceCreatedAt: '',
  createdAt: '',
  title: 'type=0 列表与统计范围可能不一致',
  summary: '列表不限类型，统计限定 consume。',
  preference: '共用筛选口径。',
  correction: '核对 type=0。',
  action: '提醒已加入上下文',
  verification: '效果待核实',
}

describe('Advisor short notice presentation', () => {
  test('shows deviation, actual preference and corrective reference before status', () => {
    assert.deepEqual(advisorNoticePresentation(notification), {
      title: notification.title,
      body: '列表不限类型，统计限定 consume。 → 共用筛选口径。 → 核对 type=0。',
      status: '提醒已加入上下文 · 效果待核实',
    })
  })
  test('new risks with different ids remain independently presentable', () => {
    const notices = [
      notification,
      { ...notification, advisorId: 'two', title: '金额缺失不得静默按零处理' },
    ].map(advisorNoticePresentation)
    assert.equal(notices.length, 2)
    assert.notEqual(notices[0].title, notices[1].title)
  })
})

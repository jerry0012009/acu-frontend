import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { PrivateACUAdvisorNotification } from '../../advisor-api'
import {
  advisorNoticePresentation,
  newAdvisorNotifications,
} from '../advisor-notice'

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
  test('old placeholder API content is replaced with actual issue and existing advice', () => {
    const result = advisorNoticePresentation({
      ...notification,
      title: 'Private ACU | 有一项任务检查建议待查看',
      summary: '本次还没有可靠的简短说明',
      preference: '本次未找到明确的偏好依据',
      correction: '本次未提供可靠的纠偏摘要',
    })
    assert.equal(result.title, 'raw private detail')
    assert.equal(result.body, 'raw private detail → raw advice')
    assert.doesNotMatch(result.body, /未找到|未提供|可靠的简短/)
  })
  test('first successful load establishes baseline and reappearing ids never notify twice', () => {
    assert.deepEqual(newAdvisorNotifications([notification], null), [])
    const seen = new Set([notification.advisorId])
    const fresh = { ...notification, advisorId: 'two' }
    assert.deepEqual(newAdvisorNotifications([notification, fresh], seen), [
      fresh,
    ])
    assert.deepEqual(newAdvisorNotifications([], seen), [])
    assert.deepEqual(newAdvisorNotifications([fresh, notification], seen), [])
    assert.deepEqual(
      newAdvisorNotifications(
        [{ ...fresh, advisorId: 'read', readAt: 'now' }],
        seen
      ),
      []
    )
  })
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

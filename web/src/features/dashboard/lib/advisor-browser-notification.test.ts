import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { PrivateACUAdvisorNotification } from '../advisor-api'
import {
  requestAdvisorBrowserNotificationPermission,
  showAdvisorBrowserNotifications,
  type AdvisorNotificationEnvironment,
} from './advisor-browser-notification'

type NotificationCall = {
  title: string
  options?: NotificationOptions
}

const advisorNotification: PrivateACUAdvisorNotification = {
  id: 1,
  advisorId: 'advisor_test_1',
  status: 'risk',
  problemSummary: '用户偏好要求先验证真实生产链路',
  adviceSummary: '当前可关注浏览器通知权限和同 session 注入证据。',
  referenceStatus: 'injected',
  targetPath: '/private-acu/advisor?advisor=advisor_test_1',
  sourceCreatedAt: '2026-09-07T00:00:00.000Z',
  createdAt: '2026-09-07T00:00:00.000Z',
}

function createNotificationTarget(
  permission: NotificationPermission,
  calls: NotificationCall[] = []
): AdvisorNotificationEnvironment {
  const TestNotification = class {
    static permission: NotificationPermission = permission
    static requestPermission = async () => permission

    constructor(title: string, options?: NotificationOptions) {
      calls.push({ title, options })
    }
  }

  return {
    Notification:
      TestNotification as unknown as AdvisorNotificationEnvironment['Notification'],
  }
}

describe('Advisor browser notifications', () => {
  test('creates a browser system notification when permission is granted', () => {
    const calls: NotificationCall[] = []
    const result = showAdvisorBrowserNotifications([advisorNotification], {
      browserEnabled: true,
      target: createNotificationTarget('granted', calls),
    })

    assert.deepEqual(result, {
      attempted: 1,
      delivered: 1,
      skipped: null,
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.title, 'Private ACU Advisor')
    assert.equal(calls[0]?.options?.tag, 'acu-advisor-advisor_test_1')
    assert.equal(calls[0]?.options?.icon, '/logo.png')
    assert.equal(calls[0]?.options?.silent, false)
    assert.match(calls[0]?.options?.body ?? '', /真实生产链路/)
    assert.match(calls[0]?.options?.body ?? '', /浏览器通知权限/)
  })

  test('does not show a browser notification when the channel is disabled', () => {
    const calls: NotificationCall[] = []
    const result = showAdvisorBrowserNotifications([advisorNotification], {
      browserEnabled: false,
      target: createNotificationTarget('granted', calls),
    })

    assert.deepEqual(result, {
      attempted: 0,
      delivered: 0,
      skipped: 'browser-disabled',
    })
    assert.equal(calls.length, 0)
  })

  test('does not show a browser notification before permission is granted', () => {
    const calls: NotificationCall[] = []
    const result = showAdvisorBrowserNotifications([advisorNotification], {
      browserEnabled: true,
      target: createNotificationTarget('default', calls),
    })

    assert.deepEqual(result, {
      attempted: 0,
      delivered: 0,
      skipped: 'permission-not-granted',
    })
    assert.equal(calls.length, 0)
  })

  test('requests permission through the browser Notification API', async () => {
    const permission = await requestAdvisorBrowserNotificationPermission(
      createNotificationTarget('granted')
    )

    assert.equal(permission, 'granted')
  })
})

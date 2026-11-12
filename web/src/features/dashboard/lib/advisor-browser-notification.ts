import type { PrivateACUAdvisorNotification } from '../advisor-api'
import { advisorNoticePresentation } from './advisor-notice'

export type AdvisorNotificationConstructor = {
  readonly permission: NotificationPermission
  requestPermission?: () => Promise<NotificationPermission>
  new (title: string, options?: NotificationOptions): Notification
}

export type AdvisorNotificationEnvironment = {
  readonly Notification?: AdvisorNotificationConstructor
}

export type AdvisorBrowserNotificationResult = {
  attempted: number
  delivered: number
  skipped:
    | 'browser-disabled'
    | 'browser-unsupported'
    | 'permission-not-granted'
    | null
}

function getNotificationEnvironment(
  target?: AdvisorNotificationEnvironment
): AdvisorNotificationEnvironment | undefined {
  if (target) return target
  if (typeof window === 'undefined') return undefined
  return window
}

export async function requestAdvisorBrowserNotificationPermission(
  target?: AdvisorNotificationEnvironment
): Promise<NotificationPermission> {
  const notificationApi = getNotificationEnvironment(target)?.Notification
  if (!notificationApi?.requestPermission) return 'denied'
  return notificationApi.requestPermission()
}

export function showAdvisorBrowserNotifications(
  notifications: PrivateACUAdvisorNotification[],
  options: {
    browserEnabled: boolean
    target?: AdvisorNotificationEnvironment
  }
): AdvisorBrowserNotificationResult {
  if (!options.browserEnabled) {
    return {
      attempted: 0,
      delivered: 0,
      skipped: 'browser-disabled',
    }
  }

  const notificationApi = getNotificationEnvironment(
    options.target
  )?.Notification
  if (!notificationApi) {
    return {
      attempted: 0,
      delivered: 0,
      skipped: 'browser-unsupported',
    }
  }

  if (notificationApi.permission !== 'granted') {
    return {
      attempted: 0,
      delivered: 0,
      skipped: 'permission-not-granted',
    }
  }

  let delivered = 0
  for (const notification of notifications) {
    try {
      const notice = advisorNoticePresentation(notification)
      new notificationApi(notice.title, {
        body: notice.body,
        tag: `acu-advisor-${notification.advisorId}`,
        icon: '/logo.png',
        silent: false,
      })
      delivered += 1
    } catch {
      // The OS/browser owns final delivery. Console bell and toast remain the fallback.
    }
  }

  return {
    attempted: notifications.length,
    delivered,
    skipped: null,
  }
}

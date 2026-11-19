import { t } from 'i18next'

import type { PrivateACUAdvisorNotification } from '../advisor-api'

// Older servers may lack structured copy. Do not infer a user's preference.
export function advisorNoticePresentation(
  notification: PrivateACUAdvisorNotification
) {
  const oldPlaceholder =
    notification.title?.includes('有一项任务检查建议待查看') ||
    notification.title?.includes('A task review is ready')
  const title = oldPlaceholder
    ? [...(notification.problemSummary || notification.adviceSummary)]
        .slice(0, 42)
        .join('')
    : notification.title || t('Private ACU Advisor')
  const heading = title.replace(/^Private ACU\s*[|｜]\s*/i, '').trim() || title
  const parts = (
    oldPlaceholder
      ? [notification.problemSummary, notification.adviceSummary]
      : [notification.summary, notification.preference, notification.correction]
  ).filter(Boolean)
  return {
    title,
    heading,
    body: parts.join(' → ') || t('View audit details'),
    preview: parts.find((part) => part && !part.startsWith(heading)) || '',
    status: [notification.action, notification.verification]
      .filter(Boolean)
      .join(' · '),
  }
}

export function newAdvisorNotifications(
  notifications: PrivateACUAdvisorNotification[],
  seen: Set<string> | null
) {
  if (!seen) return []
  const fresh = notifications.filter(
    (item) => !seen.has(item.advisorId) && !item.readAt
  )
  for (const item of notifications) seen.add(item.advisorId)
  return fresh
}

import { t } from 'i18next'

import type { PrivateACUAdvisorNotification } from '../advisor-api'

// Older servers may lack structured copy. Do not infer a user's preference.
export function advisorNoticePresentation(
  notification: PrivateACUAdvisorNotification
) {
  const title = notification.title || t('Private ACU Advisor')
  const body = [
    notification.summary,
    notification.preference,
    notification.correction,
  ]
    .filter(Boolean)
    .join(' → ')
  return {
    title,
    body: body || t('View audit details'),
    status: [notification.action, notification.verification]
      .filter(Boolean)
      .join(' · '),
  }
}

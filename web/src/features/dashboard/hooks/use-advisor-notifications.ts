import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  getPrivateACUAdvisorNotificationPreferences,
  getPrivateACUAdvisorNotifications,
  markAllPrivateACUAdvisorNotificationsRead,
} from '../advisor-api'

export const ADVISOR_TOAST_ID = 'acu-advisor-in-app'

export function advisorNotificationsOptions(userId: number | undefined) {
  return queryOptions({
    queryKey: ['private-acu', 'advisor-notifications', userId],
    queryFn: () => getPrivateACUAdvisorNotifications(10),
    enabled: Boolean(userId),
    staleTime: 10_000,
  })
}

export function advisorNotificationPreferencesOptions(
  userId: number | undefined
) {
  return queryOptions({
    queryKey: ['private-acu', 'advisor-notification-preferences', userId],
    queryFn: getPrivateACUAdvisorNotificationPreferences,
    staleTime: 60_000,
  })
}

export function useReadAllAdvisorNotifications(userId: number | undefined) {
  const queryClient = useQueryClient()
  const { queryKey } = advisorNotificationsOptions(userId)

  return useMutation({
    mutationFn: markAllPrivateACUAdvisorNotificationsRead,
    networkMode: 'always',
    // Both surfaces show an inline retryable error instead of another toast.
    onError: () => undefined,
    onSuccess: async () => {
      toast.dismiss(ADVISOR_TOAST_ID)
      await queryClient.invalidateQueries({ queryKey })
    },
  })
}

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  markPrivateACUAdvisorNotificationRead,
  type PrivateACUAdvisorNotification,
} from '@/features/dashboard/advisor-api'
import {
  ADVISOR_TOAST_ID,
  advisorNotificationPreferencesOptions,
  advisorNotificationsOptions,
  useReadAllAdvisorNotifications,
} from '@/features/dashboard/hooks/use-advisor-notifications'
import { showAdvisorBrowserNotifications } from '@/features/dashboard/lib/advisor-browser-notification'
import {
  advisorNoticePresentation,
  newAdvisorNotifications,
} from '@/features/dashboard/lib/advisor-notice'
import { useStatus } from '@/hooks/use-status'
import { getNotice } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'

function hashString(input: string): string {
  let hash = 0
  if (!input) return '0'

  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }

  return hash.toString(36)
}

/**
 * Generate a unique key for an announcement
 * Prefer backend id, fall back to a content hash so edits register
 */
function getAnnouncementKey(item: Record<string, unknown>): string {
  if (!item) return ''

  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`
  }

  const fingerprint = JSON.stringify({
    publishDate: (item?.publishDate as string) || '',
    content: ((item?.content as string) || '').trim(),
    extra: ((item?.extra as string) || '').trim(),
    type: (item?.type as string) || '',
    title: ((item?.title as string) || '').trim(),
    link: ((item?.link as string) || '').trim(),
  })
  return `hash:${hashString(fingerprint)}`
}

/**
 * Hook to manage notifications (Notice + Announcements)
 * Provides unread counts and read status management
 */
export function useNotifications() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'notice' | 'announcements' | 'advisor'
  >('notice')
  const userId = useAuthStore((state) => state.auth.user?.id)
  const authenticated = Boolean(userId)
  const queryClient = useQueryClient()

  // Fetch Notice from API
  const {
    data: noticeResponse,
    isLoading: noticeLoading,
    refetch: refetchNotice,
  } = useQuery({
    queryKey: ['notice'],
    queryFn: getNotice,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch Announcements from status
  const { status, loading: statusLoading } = useStatus()
  const announcementsEnabled = status?.announcements_enabled ?? false
  const announcements = useMemo<Record<string, unknown>[]>(
    () =>
      announcementsEnabled
        ? ((status?.announcements || []) as Record<string, unknown>[]).slice(
            0,
            20
          )
        : [],
    [announcementsEnabled, status?.announcements]
  )

  const advisorNotificationsQuery = useQuery({
    ...advisorNotificationsOptions(userId),
    refetchInterval: authenticated ? 30_000 : false,
  })
  const readAllAdvisorNotifications = useReadAllAdvisorNotifications(userId)
  const advisorPreferencesQuery = useQuery({
    ...advisorNotificationPreferencesOptions(userId),
    enabled: authenticated,
  })
  const seenAdvisorIds = useRef<Set<string> | null>(null)
  const seenAdvisorUser = useRef(userId)
  const advisorNotifications = useMemo(
    () => advisorNotificationsQuery.data?.notifications ?? [],
    [advisorNotificationsQuery.data?.notifications]
  )
  const advisorUnreadCount = advisorNotificationsQuery.data?.unreadCount ?? 0

  const openAdvisorNotification = useCallback(
    async (notification: PrivateACUAdvisorNotification) => {
      // Navigation does not depend on the read receipt. The API reports failures.
      void markPrivateACUAdvisorNotificationRead(notification.advisorId)
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: advisorNotificationsOptions(userId).queryKey,
          })
        )
        .catch(() => undefined)
      await navigate({
        to: '/private-acu/$section',
        params: { section: 'advisor' },
        search: { advisor: notification.advisorId },
      })
    },
    [navigate, queryClient, userId]
  )

  useEffect(() => {
    if (seenAdvisorUser.current !== userId) {
      toast.dismiss(ADVISOR_TOAST_ID)
      seenAdvisorUser.current = userId
      seenAdvisorIds.current = null
    }
    if (!advisorNotificationsQuery.isSuccess || !authenticated) return
    if (!seenAdvisorIds.current) {
      seenAdvisorIds.current = new Set(
        advisorNotifications.map((item) => item.advisorId)
      )
      return
    }
    const newNotifications = newAdvisorNotifications(
      advisorNotifications,
      seenAdvisorIds.current
    )
    if (newNotifications.length === 0) return

    void queryClient.invalidateQueries({
      queryKey: ['dashboard', 'private-acu-advisor'],
    })

    if (advisorPreferencesQuery.data?.inAppEnabled) {
      const notification = newNotifications[0]
      const count = newNotifications.length
      toast.info(t('Advisor'), {
        id: ADVISOR_TOAST_ID,
        position: 'bottom-right',
        duration: 8000,
        richColors: false,
        description:
          count > 1
            ? t('New suggestions: {{count}}', { count })
            : advisorNoticePresentation(notification).heading,
        descriptionClassName: 'line-clamp-2',
        action: {
          label: t('View suggestions'),
          onClick: () => {
            if (count === 1) {
              void openAdvisorNotification(notification)
              return
            }
            void navigate({
              to: '/private-acu/$section',
              params: { section: 'advisor' },
              search: {},
            })
          },
        },
      })
    }

    showAdvisorBrowserNotifications(newNotifications, {
      browserEnabled: Boolean(advisorPreferencesQuery.data?.browserEnabled),
    })
  }, [
    advisorNotifications,
    advisorPreferencesQuery.data?.inAppEnabled,
    advisorPreferencesQuery.data?.browserEnabled,
    queryClient,
    advisorNotificationsQuery.isSuccess,
    authenticated,
    userId,
    openAdvisorNotification,
    navigate,
    t,
  ])

  // Notification store
  const {
    lastReadNotice,
    markNoticeRead,
    markAnnouncementsRead,
    readAnnouncementKeys,
  } = useNotificationStore()

  // Extract notice content
  const noticeContent = noticeResponse?.success
    ? (noticeResponse.data || '').trim()
    : ''

  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    const noticeUnread =
      noticeContent && noticeContent !== lastReadNotice ? 1 : 0

    const announcementsUnread = announcements.filter(
      (item: Record<string, unknown>) => {
        const key = getAnnouncementKey(item)
        return !readAnnouncementKeys.includes(key)
      }
    ).length

    return {
      notice: noticeUnread,
      announcements: announcementsUnread,
      advisor: advisorUnreadCount,
      total: noticeUnread + announcementsUnread + advisorUnreadCount,
    }
  }, [
    noticeContent,
    lastReadNotice,
    announcements,
    readAnnouncementKeys,
    advisorUnreadCount,
  ])

  const markAnnouncementsAsRead = () => {
    if (announcements.length > 0) {
      const allKeys = announcements.map((item: Record<string, unknown>) =>
        getAnnouncementKey(item)
      )
      markAnnouncementsRead(allKeys)
    }
  }

  const markAllNotificationsAsRead = async () => {
    if (noticeContent) {
      markNoticeRead(noticeContent)
    }
    markAnnouncementsAsRead()

    if (advisorUnreadCount > 0) {
      await readAllAdvisorNotifications.mutateAsync()
    }
  }

  // Handle popover open
  const handleOpenPopover = (tab?: 'notice' | 'announcements' | 'advisor') => {
    const nextTab = tab || activeTab

    // Mark currently visible content as read when opening the notification center
    if (noticeContent) {
      markNoticeRead(noticeContent)
    }
    if (nextTab === 'announcements') {
      markAnnouncementsAsRead()
    }
    if (nextTab === 'advisor') {
      void advisorNotificationsQuery.refetch()
    }

    setActiveTab(nextTab)
    setPopoverOpen(true)
  }

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      handleOpenPopover(activeTab)
      return
    }

    setPopoverOpen(false)
  }

  // Handle tab change - mark announcements as read when switching to that tab
  const handleTabChange = (tab: 'notice' | 'announcements' | 'advisor') => {
    setActiveTab(tab)

    if (tab === 'announcements') {
      markAnnouncementsAsRead()
    }
    if (tab === 'advisor') {
      void advisorNotificationsQuery.refetch()
    }
  }

  return {
    // Data
    notice: noticeContent,
    announcements,
    advisorNotifications,
    loading: noticeLoading || statusLoading,

    // Unread counts
    unreadCount: unreadCounts.total,
    unreadNoticeCount: unreadCounts.notice,
    unreadAnnouncementsCount: unreadCounts.announcements,
    unreadAdvisorCount: unreadCounts.advisor,

    // Popover state
    popoverOpen,
    setPopoverOpen: handlePopoverOpenChange,
    activeTab,
    setActiveTab: handleTabChange,
    openAdvisorNotification,

    // Actions
    markAllNotificationsAsRead,
    openPopover: handleOpenPopover,
    closePopover: () => setPopoverOpen(false),
    refetchNotice,
  }
}

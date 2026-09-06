import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getPrivateACUAdvisorNotificationPreferences,
  getPrivateACUAdvisorNotifications,
  markPrivateACUAdvisorNotificationRead,
  type PrivateACUAdvisorNotification,
} from '@/features/dashboard/advisor-api'
import { showAdvisorBrowserNotifications } from '@/features/dashboard/lib/advisor-browser-notification'
import { useStatus } from '@/hooks/use-status'
import { getNotice } from '@/lib/api'
import { useNotificationStore } from '@/stores/notification-store'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

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
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'notice' | 'announcements' | 'advisor'
  >(
    'notice'
  )
  const authenticated = useAuthStore((state) => Boolean(state.auth.user))

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
    queryKey: ['private-acu', 'advisor-notifications'],
    queryFn: () => getPrivateACUAdvisorNotifications(10),
    enabled: authenticated,
    refetchInterval: authenticated ? 30_000 : false,
    staleTime: 10_000,
  })
  const advisorPreferencesQuery = useQuery({
    queryKey: ['private-acu', 'advisor-notification-preferences'],
    queryFn: getPrivateACUAdvisorNotificationPreferences,
    enabled: authenticated,
    staleTime: 60_000,
  })
  const seenAdvisorIds = useRef<Set<string> | null>(null)
  const advisorNotifications = useMemo(
    () => advisorNotificationsQuery.data?.notifications ?? [],
    [advisorNotificationsQuery.data?.notifications]
  )
  const advisorUnreadCount = advisorNotificationsQuery.data?.unreadCount ?? 0

  useEffect(() => {
    const currentIds = new Set(
      advisorNotifications.map((notification) => notification.advisorId)
    )
    const previousIds = seenAdvisorIds.current
    seenAdvisorIds.current = currentIds
    if (!previousIds) return
    const newNotifications = advisorNotifications.filter(
      (notification) => !previousIds.has(notification.advisorId)
    )
    if (newNotifications.length === 0) return

    if (advisorPreferencesQuery.data?.inAppEnabled) {
      toast.info('New Private ACU Advisor suggestion')
    }

    showAdvisorBrowserNotifications(newNotifications, {
      browserEnabled: Boolean(advisorPreferencesQuery.data?.browserEnabled),
    })
  }, [
    advisorNotifications,
    advisorPreferencesQuery.data?.inAppEnabled,
    advisorPreferencesQuery.data?.browserEnabled,
  ])

  // Notification store
  const {
    lastReadNotice,
    markNoticeRead,
    markAnnouncementsRead,
    isAnnouncementRead,
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
        return !isAnnouncementRead(key)
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
    isAnnouncementRead,
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

  // Handle popover open
  const handleOpenPopover = (
    tab?: 'notice' | 'announcements' | 'advisor'
  ) => {
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
  const handleTabChange = (
    tab: 'notice' | 'announcements' | 'advisor'
  ) => {
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
    openAdvisorNotification: async (
      notification: PrivateACUAdvisorNotification
    ) => {
      await markPrivateACUAdvisorNotificationRead(notification.advisorId)
      window.location.assign(notification.targetPath)
    },

    // Actions
    openPopover: handleOpenPopover,
    closePopover: () => setPopoverOpen(false),
    refetchNotice,
  }
}

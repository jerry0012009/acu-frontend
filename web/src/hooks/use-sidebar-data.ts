import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Box,
  CreditCard,
  FileText,
  FlaskConical,
  Key,
  LayoutDashboard,
  ListTodo,
  Radio,
  Route,
  ServerCog,
  Settings,
  Ticket,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SidebarData } from '@/components/layout/types'
import { getPrivateACUFilmForUser } from '@/features/dashboard/private-acu-user-api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const userRole = useAuthStore((state) => state.auth.user?.role ?? ROLE.GUEST)
  const memberFilmQuery = useQuery({
    queryKey: ['private-acu', 'sidebar-access'],
    queryFn: getPrivateACUFilmForUser,
    enabled: userRole < ROLE.ADMIN,
    retry: false,
    staleTime: 60_000,
  })
  const canSeePrivateACU =
    userRole >= ROLE.ADMIN || Boolean(memberFilmQuery.data?.spaces.length)

  return {
    navGroups: [
      {
        id: 'chat',
        title: t('Experience'),
        items: [
          {
            title: t('ACU Conversation'),
            url: '/playground',
            icon: FlaskConical,
          },
        ],
      },
      {
        id: 'general',
        title: t('Management'),
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Call Records'),
            url: '/usage-logs/common',
            icon: FileText,
          },
          {
            title: t('Supply Monitor'),
            url: '/usage-logs/channel-monitor',
            icon: Activity,
          },
          {
            title: t('Async Tasks'),
            url: '/usage-logs/task',
            activeUrls: ['/usage-logs/drawing'],
            configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            icon: ListTodo,
            requiredRole: ROLE.ADMIN,
          },
        ],
      },
      {
        id: 'acu',
        title: t('ACU'),
        items: [
          {
            title: t('Route Timeline'),
            url: '/usage-logs/timeline',
            icon: Route,
          },
          ...(canSeePrivateACU
            ? [
                {
                  title: t('Private ACU'),
                  url: '/private-acu/overview',
                  icon: Settings,
                },
              ]
            : []),
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
          },
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            title: t('Channels'),
            url: '/channels',
            icon: Radio,
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
          },
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
          },
          {
            title: t('Subscriptions'),
            url: '/subscriptions',
            icon: CreditCard,
          },
          {
            title: t('System Info'),
            url: '/system-info',
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
          },
        ],
      },
    ],
  }
}

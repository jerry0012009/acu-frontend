import type { TFunction } from 'i18next'
import {
  BookOpen,
  Film,
  Gauge,
  LayoutDashboard,
  ListChecks,
} from 'lucide-react'

import { ROLE } from '@/lib/roles'

import type { NavGroup, SidebarView } from '../types'

function getPrivateACUNavGroups(t: TFunction): NavGroup[] {
  return [
    {
      id: 'private-acu-workspace',
      title: t('Private ACU'),
      items: [
        {
          title: t('Overview'),
          url: '/private-acu/overview',
          icon: LayoutDashboard,
        },
        {
          title: t('Account learning'),
          url: '/private-acu/account',
          icon: BookOpen,
          requiredRole: ROLE.ADMIN,
        },
        {
          title: t('Film POC'),
          url: '/private-acu/film',
          icon: Film,
        },
        {
          title: t('Learning runs'),
          url: '/private-acu/learning-runs',
          icon: ListChecks,
          requiredRole: ROLE.ADMIN,
        },
        {
          title: t('Prompts'),
          url: '/private-acu/prompts',
          icon: Gauge,
          requiredRole: ROLE.ADMIN,
        },
      ],
    },
  ]
}

export const PRIVATE_ACU_VIEW: SidebarView = {
  id: 'private-acu',
  pathPattern: /^\/private-acu(\/|$)/,
  parent: {
    to: '/usage-logs/timeline',
    label: 'Back to ACU',
  },
  getNavGroups: getPrivateACUNavGroups,
}

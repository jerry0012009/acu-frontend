import { createFileRoute, redirect } from '@tanstack/react-router'

import { Dashboard } from '@/features/dashboard'
import {
  DASHBOARD_SECTION_IDS,
  DASHBOARD_DEFAULT_SECTION,
} from '@/features/dashboard/section-registry'

export const Route = createFileRoute('/_authenticated/dashboard/$section')({
  beforeLoad: ({ params }) => {
    if (params.section === 'acu-private-admin') {
      throw redirect({
        to: '/private-acu/$section',
        params: { section: 'overview' },
      })
    }
    const validSections = DASHBOARD_SECTION_IDS as unknown as string[]
    if (!validSections.includes(params.section)) {
      throw redirect({
        to: '/dashboard/$section',
        params: { section: DASHBOARD_DEFAULT_SECTION },
      })
    }
  },
  component: Dashboard,
})

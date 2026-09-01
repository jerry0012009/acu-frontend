import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import {
  PrivateACUWorkspace,
  type PrivateACUSection,
} from '@/features/private-acu/private-acu-workspace'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const sections = [
  'overview',
  'account',
  'film',
  'learning-runs',
  'prompts',
] as const

const privateACUSearchSchema = z.object({
  learningKind: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/private-acu/$section')({
  validateSearch: privateACUSearchSchema,
  beforeLoad: ({ params }) => {
    if (!sections.includes(params.section as PrivateACUSection)) {
      throw redirect({
        to: '/private-acu/$section',
        params: { section: 'overview' },
      })
    }
    const role = useAuthStore.getState().auth.user?.role ?? ROLE.GUEST
    if (role < ROLE.ADMIN && params.section !== 'film') {
      throw redirect({
        to: '/private-acu/$section',
        params: { section: 'film' },
      })
    }
  },
  component: PrivateACUSectionRoute,
})

function PrivateACUSectionRoute() {
  const search = Route.useSearch()
  return (
    <PrivateACUWorkspace
      section={Route.useParams().section as PrivateACUSection}
      learningKind={search.learningKind}
    />
  )
}

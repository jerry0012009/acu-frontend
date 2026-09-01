import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/private-acu/')({
  beforeLoad: () => {
    throw redirect({
      to: '/private-acu/$section',
      params: { section: 'overview' },
    })
  },
})

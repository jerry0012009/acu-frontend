import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/connect/')({
  beforeLoad: () => {
    throw redirect({ href: '/#start', replace: true })
  },
})

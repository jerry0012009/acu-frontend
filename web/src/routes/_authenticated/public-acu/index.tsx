import { createFileRoute } from '@tanstack/react-router'

import { PublicACUPage } from '@/features/public-acu/public-acu-page'

export const Route = createFileRoute('/_authenticated/public-acu/')({
  component: PublicACUPage,
})

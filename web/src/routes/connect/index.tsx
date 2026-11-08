import { createFileRoute } from '@tanstack/react-router'

import { ConnectPage } from '@/features/acu/components/connect-page'

export const Route = createFileRoute('/connect/')({ component: ConnectPage })

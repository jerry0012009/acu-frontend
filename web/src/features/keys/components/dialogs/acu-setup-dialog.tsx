import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import type { AcuQuickStartTab } from '@/features/acu/components/acu-quick-start'

import { ClaudeACUSetup } from '../claude-acu-setup'

type AcuSetupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tokenKey: string
  initialTab?: AcuQuickStartTab
}

export function AcuSetupDialog(props: AcuSetupDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('ACU Setup')}
      contentClassName='sm:max-w-2xl'
      bodyClassName='min-w-0'
      showCloseButton
    >
      <ClaudeACUSetup tokenKey={props.tokenKey} initialTab={props.initialTab} />
    </Dialog>
  )
}

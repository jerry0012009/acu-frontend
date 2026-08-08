import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'

import { ClaudeACUSetup } from '../claude-acu-setup'

type AcuSetupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tokenKey: string
}

export function AcuSetupDialog(props: AcuSetupDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('ACU Setup')}
      contentClassName='sm:max-w-3xl'
      bodyClassName='min-w-0'
      showCloseButton
    >
      <ClaudeACUSetup tokenKey={props.tokenKey} />
    </Dialog>
  )
}

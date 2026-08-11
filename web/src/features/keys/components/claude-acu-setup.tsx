import { useState } from 'react'

import { AcuQuickStart } from '@/features/acu/components/acu-quick-start'

import { CCSwitchDialog } from './dialogs/cc-switch-dialog'

type ClaudeACUSetupProps = {
  tokenKey: string
}

export function ClaudeACUSetup(props: ClaudeACUSetupProps) {
  const [ccSwitchOpen, setCCSwitchOpen] = useState(false)

  return (
    <>
      <AcuQuickStart
        mode='credentialed'
        tokenKey={props.tokenKey}
        onOpenCCSwitch={() => setCCSwitchOpen(true)}
      />
      <CCSwitchDialog
        open={ccSwitchOpen}
        onOpenChange={setCCSwitchOpen}
        tokenKey={props.tokenKey}
      />
    </>
  )
}

import { useState } from 'react'

import {
  AcuQuickStart,
  type AcuQuickStartTab,
} from '@/features/acu/components/acu-quick-start'

import { CCSwitchDialog } from './dialogs/cc-switch-dialog'

type ClaudeACUSetupProps = {
  tokenKey: string
  initialTab?: AcuQuickStartTab
}

export function ClaudeACUSetup(props: ClaudeACUSetupProps) {
  const [ccSwitchOpen, setCCSwitchOpen] = useState(false)

  return (
    <>
      <AcuQuickStart
        mode='credentialed'
        tokenKey={props.tokenKey}
        initialTab={props.initialTab}
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

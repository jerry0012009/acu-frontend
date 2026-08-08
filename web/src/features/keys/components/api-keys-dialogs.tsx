import { ApiKeysDeleteDialog } from './api-keys-delete-dialog'
import { ApiKeysMutateDrawer } from './api-keys-mutate-drawer'
import { useApiKeys } from './api-keys-provider'
import { AcuSetupDialog } from './dialogs/acu-setup-dialog'
import { CCSwitchDialog } from './dialogs/cc-switch-dialog'

export function ApiKeysDialogs() {
  const { open, setOpen, currentRow, resolvedKey } = useApiKeys()
  let mode: 'create' | 'update' | 'clone' = 'create'
  if (open === 'update') mode = 'update'
  if (open === 'clone') mode = 'clone'

  return (
    <>
      <ApiKeysMutateDrawer
        open={open === 'create' || open === 'update' || open === 'clone'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        currentRow={
          open === 'update' || open === 'clone'
            ? currentRow || undefined
            : undefined
        }
        mode={mode}
      />
      <ApiKeysDeleteDialog />
      <CCSwitchDialog
        open={open === 'cc-switch'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        tokenKey={resolvedKey}
      />
      <AcuSetupDialog
        open={open === 'acu-setup'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        tokenKey={resolvedKey}
      />
    </>
  )
}

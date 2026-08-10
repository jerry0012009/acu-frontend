import { Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function normalizeKey(value: string): string {
  return value.startsWith('sk-') ? value : `sk-${value}`
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function powerShellQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function buildWindowsCommandPromptInstall(powerShellCommand: string): string {
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${powerShellCommand}"`
}

function buildCodexUnixInstall(tokenKey: string): string {
  const key = shellQuote(normalizeKey(tokenKey))
  return (
    '{ curl -fsSL https://api.acucompute.com/codex-acu-install.sh || ' +
    'curl -fsSL https://acu-api-direct.jerrypsy.top/codex-acu-install.sh || ' +
    'curl -fsSL https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.sh; } ' +
    `| ACU_API_KEY=${key} sh`
  )
}

function buildCodexPowerShellInstall(tokenKey: string): string {
  const key = powerShellQuote(normalizeKey(tokenKey))
  return (
    `$env:ACU_API_KEY=${key}; ` +
    "try { irm 'https://api.acucompute.com/codex-acu-install.ps1' | iex } " +
    "catch { try { irm 'https://acu-api-direct.jerrypsy.top/codex-acu-install.ps1' | iex } " +
    "catch { irm 'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.ps1' | iex } }"
  )
}

function buildClaudeUnixInstall(tokenKey: string): string {
  const key = shellQuote(normalizeKey(tokenKey))
  return (
    '{ curl -fsSL https://api.acucompute.com/claude-acu-install.sh || ' +
    'curl -fsSL https://acu-api-direct.jerrypsy.top/claude-acu-install.sh || ' +
    'curl -fsSL https://raw.githubusercontent.com/jerry0012009/acu-frontend/main/web/public/claude-acu-install.sh; } ' +
    `| ACU_API_KEY=${key} sh`
  )
}

function buildClaudePowerShellInstall(tokenKey: string): string {
  const key = powerShellQuote(normalizeKey(tokenKey))
  return (
    `$env:ACU_API_KEY=${key}; ` +
    "try { irm 'https://api.acucompute.com/claude-acu-install.ps1' | iex } " +
    "catch { try { irm 'https://acu-api-direct.jerrypsy.top/claude-acu-install.ps1' | iex } " +
    "catch { irm 'https://raw.githubusercontent.com/jerry0012009/acu-frontend/main/web/public/claude-acu-install.ps1' | iex } }"
  )
}

function CommandRow(props: { label: string; value: string }) {
  return (
    <div className='min-w-0 space-y-1'>
      <div className='text-muted-foreground text-xs font-medium'>
        {props.label}
      </div>
      <div className='bg-muted/50 flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5'>
        <code className='min-w-0 flex-1 overflow-x-auto text-xs whitespace-nowrap'>
          {props.value}
        </code>
        <CopyButton
          value={props.value}
          className='size-7'
          tooltip={`Copy ${props.label}`}
        />
      </div>
    </div>
  )
}

type ClaudeACUSetupProps = {
  tokenKey: string
}

export function ClaudeACUSetup(props: ClaudeACUSetupProps) {
  const { t } = useTranslation()
  const codexUnixInstall = buildCodexUnixInstall(props.tokenKey)
  const codexPowerShellInstall = buildCodexPowerShellInstall(props.tokenKey)
  const codexCommandPromptInstall = buildWindowsCommandPromptInstall(
    codexPowerShellInstall
  )
  const claudeUnixInstall = buildClaudeUnixInstall(props.tokenKey)
  const claudePowerShellInstall = buildClaudePowerShellInstall(props.tokenKey)
  const claudeCommandPromptInstall = buildWindowsCommandPromptInstall(
    claudePowerShellInstall
  )

  return (
    <section>
      <Tabs defaultValue='codex'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2 text-sm font-medium'>
            <Terminal className='size-4' />
            {t('ACU client setup')}
          </div>
          <TabsList>
            <TabsTrigger value='codex'>Codex ACU</TabsTrigger>
            <TabsTrigger value='claude'>Claude ACU</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value='codex' className='mt-3 space-y-3'>
          <div className='grid min-w-0 gap-3'>
            <CommandRow
              label={t('macOS / Linux / WSL')}
              value={codexUnixInstall}
            />
            <CommandRow
              label={t('Windows PowerShell')}
              value={codexPowerShellInstall}
            />
            <CommandRow
              label={t('Windows Command Prompt')}
              value={codexCommandPromptInstall}
            />
            <CommandRow
              label={t('Test')}
              value='codex-acu exec "Return exactly CODEX_ACU_OK"'
            />
          </div>
        </TabsContent>
        <TabsContent value='claude' className='mt-3 space-y-3'>
          <div className='grid min-w-0 gap-3 lg:grid-cols-2'>
            <CommandRow
              label={t('macOS / Linux / WSL')}
              value={claudeUnixInstall}
            />
            <CommandRow
              label={t('Windows PowerShell')}
              value={claudePowerShellInstall}
            />
            <CommandRow
              label={t('Windows Command Prompt')}
              value={claudeCommandPromptInstall}
            />
            <CommandRow
              label={t('Test')}
              value='claude-acu -p --max-turns 1 "Return exactly CLAUDE_ACU_OK"'
            />
            <CommandRow
              label={t('Reset / uninstall')}
              value='rm -rf ~/.claude-acu ~/.local/bin/claude-acu'
            />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

import { Terminal } from 'lucide-react'

import { CopyButton } from '@/components/copy-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const UNIX_INSTALL =
  'curl -fsSL https://eu.jerrypsy.top:8443/claude-acu-install.sh | sh'
const WINDOWS_INSTALL =
  'irm https://eu.jerrypsy.top:8443/claude-acu-install.ps1 | iex'
const MANUAL_ENV = `ANTHROPIC_BASE_URL=https://eu.jerrypsy.top:8443
ANTHROPIC_AUTH_TOKEN=<ACU API Key>
ANTHROPIC_CUSTOM_MODEL_OPTION=acu-auto
ANTHROPIC_CUSTOM_MODEL_OPTION_NAME=ACU Auto
ANTHROPIC_DEFAULT_OPUS_MODEL=acu-auto
ANTHROPIC_DEFAULT_SONNET_MODEL=acu-auto
ANTHROPIC_DEFAULT_HAIKU_MODEL=acu-auto
CLAUDE_CODE_SUBAGENT_MODEL=acu-auto`

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

export function ClaudeACUSetup() {
  return (
    <section className='mb-4 border-b pb-4'>
      <Tabs defaultValue='claude'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2 text-sm font-medium'>
            <Terminal className='size-4' />
            ACU client setup
          </div>
          <TabsList>
            <TabsTrigger value='codex'>Codex ACU</TabsTrigger>
            <TabsTrigger value='claude'>Claude ACU</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value='codex' className='mt-3'>
          <CommandRow label='Test' value='codex-acu exec "Return exactly OK"' />
        </TabsContent>
        <TabsContent value='claude' className='mt-3 space-y-3'>
          <div className='grid min-w-0 gap-3 lg:grid-cols-2'>
            <CommandRow label='macOS / Linux / WSL' value={UNIX_INSTALL} />
            <CommandRow label='Windows PowerShell' value={WINDOWS_INSTALL} />
            <CommandRow
              label='Test'
              value='claude-acu -p --max-turns 1 "Return exactly CLAUDE_ACU_OK"'
            />
            <CommandRow
              label='Reset / uninstall'
              value='rm -rf ~/.claude-acu ~/.local/bin/claude-acu'
            />
          </div>
          <details className='text-sm'>
            <summary className='cursor-pointer font-medium'>
              Manual environment variables
            </summary>
            <div className='bg-muted/50 mt-2 flex min-w-0 items-start gap-2 rounded-md border p-2'>
              <pre className='min-w-0 flex-1 overflow-x-auto text-xs'>
                {MANUAL_ENV}
              </pre>
              <CopyButton
                value={MANUAL_ENV}
                className='size-7'
                tooltip='Copy environment variables'
              />
            </div>
          </details>
        </TabsContent>
      </Tabs>
    </section>
  )
}

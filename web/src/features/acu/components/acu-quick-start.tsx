import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import {
  Bot,
  ChevronDown,
  CircleCheck,
  Code2,
  ExternalLink,
  Terminal,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import {
  ACU_API_BASE_URL,
  ACU_DEFAULT_MODEL,
  ACU_MASKED_API_KEY,
  buildApiCurl,
  buildHermesConfig,
  buildManualConfig,
  buildOpenClawConfig,
  buildPowerShellFallbackInstallCommand,
  buildPowerShellInstallCommand,
  buildUnixFallbackInstallCommand,
  buildUnixInstallCommand,
  buildWindowsCommandPromptInstall,
  getLaunchCommand,
  getProtocolEndpoint,
  maskCredentialText,
  normalizeApiKey,
  type AcuApiProtocol,
  type AcuClient,
} from '../lib/quick-start'

type AcuQuickStartMode = 'preview' | 'credentialed'
type PrimaryTab = 'codex' | 'claude' | 'api' | 'agent'
type Platform = 'unix' | 'windows'
type Agent = 'openclaw' | 'hermes'

type AcuQuickStartProps = {
  mode: AcuQuickStartMode
  tokenKey?: string
  className?: string
  onOpenCCSwitch?: () => void
}

const PRIMARY_TABS: Array<{
  value: PrimaryTab
  label: string
  icon: typeof Terminal
}> = [
  { value: 'codex', label: 'Codex CLI', icon: Terminal },
  { value: 'claude', label: 'Claude Code', icon: Code2 },
  { value: 'api', label: 'API / SDK', icon: ExternalLink },
  { value: 'agent', label: 'AI Agent', icon: Bot },
]

export function AcuQuickStart(props: AcuQuickStartProps) {
  const { t } = useTranslation()
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('codex')
  const copyKey =
    props.mode === 'credentialed' && props.tokenKey
      ? normalizeApiKey(props.tokenKey)
      : ACU_MASKED_API_KEY

  return (
    <section className={cn('mx-auto w-full max-w-2xl', props.className)}>
      <div className='mb-4 px-1'>
        <h2 className='text-foreground text-lg font-semibold sm:text-xl'>
          {t('Start using ACU')}
        </h2>
        <p className='text-muted-foreground mt-1 text-[13px] leading-relaxed sm:text-sm'>
          {t('Choose the tool you use and connect to ACU Auto in a few steps.')}
        </p>
      </div>

      <div className='overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0f17] text-slate-100 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.7)]'>
        <Tabs
          value={primaryTab}
          onValueChange={(value) => {
            if (value) setPrimaryTab(value as PrimaryTab)
          }}
          className='gap-0'
        >
          <div className='overflow-x-auto border-b border-white/[0.07]'>
            <TabsList
              variant='line'
              className='h-12 min-w-max gap-0 px-2 text-slate-400'
            >
              {PRIMARY_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className='h-12 min-w-[110px] gap-1.5 rounded-none px-3 text-xs text-slate-400 after:bg-sky-400 data-active:text-white sm:min-w-0 sm:flex-1'
                  >
                    <Icon className='size-3.5' />
                    {t(tab.label)}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className='min-h-[490px]'>
            <TabsContent value='codex' className='m-0'>
              <ClientQuickStart client='codex' copyKey={copyKey} />
            </TabsContent>
            <TabsContent value='claude' className='m-0'>
              <ClientQuickStart client='claude' copyKey={copyKey} />
            </TabsContent>
            <TabsContent value='api' className='m-0'>
              <ApiQuickStart
                mode={props.mode}
                copyKey={copyKey}
                onOpenCCSwitch={props.onOpenCCSwitch}
              />
            </TabsContent>
            <TabsContent value='agent' className='m-0'>
              <AgentQuickStart copyKey={copyKey} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </section>
  )
}

function ClientQuickStart(props: { client: AcuClient; copyKey: string }) {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState<Platform>('unix')
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const [otherInstallOpen, setOtherInstallOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const launchCommand = getLaunchCommand(props.client)
  const canonicalCommand =
    platform === 'unix'
      ? buildUnixInstallCommand(props.client, props.copyKey)
      : buildPowerShellInstallCommand(props.client, props.copyKey)
  const fallbackCommand =
    platform === 'unix'
      ? buildUnixFallbackInstallCommand(props.client, props.copyKey)
      : buildPowerShellFallbackInstallCommand(props.client, props.copyKey)
  const displayCanonicalCommand = maskCredentialText(
    canonicalCommand,
    props.copyKey
  )
  const displayFallbackCommand = maskCredentialText(
    fallbackCommand,
    props.copyKey
  )
  const manualConfig = buildManualConfig(props.client, props.copyKey)
  return (
    <div className='p-4 sm:p-5'>
      <SecondarySelector
        value={platform}
        onChange={(value) => setPlatform(value as Platform)}
        items={[
          { value: 'unix', label: 'macOS / Linux / WSL' },
          { value: 'windows', label: 'Windows' },
        ]}
      />

      <div className='mt-5 space-y-4'>
        <Step number='01' label={t('Install')}>
          <CodePanel
            value={canonicalCommand}
            displayValue={displayCanonicalCommand}
            copyLabel={t(
              props.copyKey === ACU_MASKED_API_KEY
                ? 'Copy template'
                : 'Copy install command'
            )}
          />
        </Step>

        {platform === 'windows' ? (
          <Disclosure
            open={otherInstallOpen}
            onOpenChange={setOtherInstallOpen}
            label={t('Other installation methods')}
          >
            <LabeledCode
              label={t('Command Prompt')}
              value={buildWindowsCommandPromptInstall(canonicalCommand)}
            />
          </Disclosure>
        ) : null}

        <Disclosure
          open={fallbackOpen}
          onOpenChange={setFallbackOpen}
          label={t('Installation trouble? Use a fallback command')}
        >
          <CodePanel
            value={fallbackCommand}
            displayValue={displayFallbackCommand}
            compact
          />
        </Disclosure>

        <Step number='02' label={t('Launch')}>
          <CodePanel value={launchCommand} />
        </Step>

        <div className='flex items-center gap-2 border-t border-white/[0.06] pt-4 text-xs text-slate-400'>
          <CircleCheck className='size-3.5 text-emerald-400' />
          {props.client === 'codex'
            ? t('Coexists with native Codex · Uses ACU Auto by default')
            : t('Coexists with native Claude Code · Uses ACU Auto by default')}
        </div>
        {props.client === 'codex' ? (
          <p className='pl-5 text-[11px] text-slate-500'>
            {t('Switch supported ACU models with /model.')}
          </p>
        ) : null}

        <Disclosure
          open={manualOpen}
          onOpenChange={setManualOpen}
          label={t('Manual configuration')}
        >
          <CodePanel
            value={manualConfig}
            displayValue={maskCredentialText(manualConfig, props.copyKey)}
            compact
          />
        </Disclosure>
      </div>
    </div>
  )
}

function ApiQuickStart(props: {
  mode: AcuQuickStartMode
  copyKey: string
  onOpenCCSwitch?: () => void
}) {
  const { t } = useTranslation()
  const [protocol, setProtocol] = useState<AcuApiProtocol>('responses')
  const [responseOpen, setResponseOpen] = useState(false)
  const responseExample =
    protocol === 'messages'
      ? '{"content":[{"type":"text","text":"..."}],"usage":{"input_tokens":12,"output_tokens":8}}'
      : '{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"..."}]}]}'

  return (
    <div className='p-4 sm:p-5'>
      <div className='divide-y divide-white/[0.06] border-y border-white/[0.06]'>
        <ConnectionRow label='Base URL' value={ACU_API_BASE_URL} />
        <ConnectionRow
          label='API Key'
          value={ACU_MASKED_API_KEY}
          copyValue={props.copyKey}
        />
        <ConnectionRow label='Model' value={ACU_DEFAULT_MODEL} />
      </div>

      <div className='mt-5'>
        <SecondarySelector
          value={protocol}
          onChange={(value) => setProtocol(value as AcuApiProtocol)}
          items={[
            { value: 'responses', label: 'Responses' },
            { value: 'messages', label: 'Messages' },
            { value: 'chat-completions', label: 'Chat Completions' },
          ]}
        />
      </div>

      <div className='mt-4 space-y-3'>
        <div className='flex items-center gap-2 text-xs text-slate-400'>
          <span className='rounded bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300'>
            POST
          </span>
          <code>{getProtocolEndpoint(protocol)}</code>
        </div>
        <CodePanel
          value={buildApiCurl(protocol, props.copyKey)}
          displayValue={maskCredentialText(
            buildApiCurl(protocol, props.copyKey),
            props.copyKey
          )}
          copyLabel={t(
            props.copyKey === ACU_MASKED_API_KEY
              ? 'Copy template'
              : 'Copy request'
          )}
          minHeight='min-h-[150px]'
        />

        <Disclosure
          open={responseOpen}
          onOpenChange={setResponseOpen}
          label={t('View example response')}
        >
          <CodePanel value={responseExample} compact />
        </Disclosure>
      </div>

      <div className='mt-5 border-t border-white/[0.06] pt-4'>
        <div className='mb-2 text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase'>
          {t('Compatible clients')}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <a
            href='https://cherry-ai.com'
            target='_blank'
            rel='noopener noreferrer'
            className='flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 text-xs text-slate-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.04]'
          >
            <CherryStudio.Color size={16} />
            Cherry Studio
          </a>
          {props.mode === 'credentialed' && props.onOpenCCSwitch ? (
            <button
              type='button'
              onClick={props.onOpenCCSwitch}
              className='flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 text-xs text-slate-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.04]'
            >
              <span className='flex size-4 items-center justify-center rounded bg-sky-400/10 text-[8px] font-bold text-sky-300'>
                CC
              </span>
              CC Switch
            </button>
          ) : (
            <Button
              variant='ghost'
              size='sm'
              className='h-8 border border-white/[0.08] bg-transparent px-2.5 text-xs text-slate-300 hover:bg-white/[0.04] hover:text-white'
              render={<Link to='/keys' />}
            >
              <span className='flex size-4 items-center justify-center rounded bg-sky-400/10 text-[8px] font-bold text-sky-300'>
                CC
              </span>
              {t('CC Switch after creating an API key')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentQuickStart(props: { copyKey: string }) {
  const { t } = useTranslation()
  const [agent, setAgent] = useState<Agent>('openclaw')
  const config =
    agent === 'openclaw'
      ? buildOpenClawConfig(props.copyKey)
      : buildHermesConfig(props.copyKey)
  const displayConfig = maskCredentialText(config, props.copyKey)
  const protocol =
    agent === 'openclaw' ? 'openai-responses' : 'chat_completions'

  return (
    <div className='p-4 sm:p-5'>
      <SecondarySelector
        value={agent}
        onChange={(value) => setAgent(value as Agent)}
        items={[
          { value: 'openclaw', label: 'OpenClaw' },
          { value: 'hermes', label: 'Hermes' },
        ]}
      />

      <div className='mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y border-white/[0.06] py-3 text-xs'>
        <span className='text-slate-500'>Base URL</span>
        <code className='truncate text-right text-slate-200'>
          {ACU_API_BASE_URL}
        </code>
        <span className='text-slate-500'>Model</span>
        <code className='text-right text-slate-200'>{ACU_DEFAULT_MODEL}</code>
        <span className='text-slate-500'>Protocol</span>
        <code className='text-right text-slate-200'>{protocol}</code>
      </div>

      <div className='mt-4'>
        <CodePanel
          value={config}
          displayValue={displayConfig}
          minHeight='min-h-[260px]'
          copyLabel={t(
            props.copyKey === ACU_MASKED_API_KEY
              ? 'Copy template'
              : 'Copy configuration'
          )}
        />
      </div>
      <p className='mt-3 text-[11px] leading-relaxed text-slate-500'>
        {t(
          'This config makes the agent itself use ACU Auto as its model provider.'
        )}
      </p>
    </div>
  )
}

function SecondarySelector(props: {
  value: string
  onChange: (value: string) => void
  items: Array<{ value: string; label: string }>
}) {
  const { t } = useTranslation()

  return (
    <div className='flex max-w-full gap-1 overflow-x-auto rounded-md bg-white/[0.04] p-1'>
      {props.items.map((item) => (
        <button
          key={item.value}
          type='button'
          onClick={() => props.onChange(item.value)}
          aria-pressed={props.value === item.value}
          className={cn(
            'h-7 shrink-0 rounded px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors',
            props.value === item.value
              ? 'bg-white/[0.09] text-white'
              : 'text-slate-500 hover:text-slate-300'
          )}
        >
          {t(item.label)}
        </button>
      ))}
    </div>
  )
}

function Step(props: { number: string; label: string; children: ReactNode }) {
  return (
    <div>
      <div className='mb-2 flex items-center gap-2'>
        <span className='font-mono text-[10px] text-sky-400/70'>
          {props.number}
        </span>
        <span className='text-xs font-medium text-slate-300'>
          {props.label}
        </span>
      </div>
      {props.children}
    </div>
  )
}

function CodePanel(props: {
  value: string
  displayValue?: string
  copyLabel?: string
  compact?: boolean
  minHeight?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-white/[0.07] bg-black/25',
        props.minHeight
      )}
    >
      <pre
        className={cn(
          'overflow-x-auto p-3 pr-11 font-mono text-[11px] leading-[1.65] text-slate-300',
          props.compact ? 'max-h-40' : 'max-h-72'
        )}
      >
        <code>{props.displayValue ?? props.value}</code>
      </pre>
      <CopyButton
        value={props.value}
        className='absolute top-2 right-2 size-7 text-slate-500 hover:bg-white/[0.06] hover:text-white'
        tooltip={props.copyLabel ?? t('Copy')}
      />
    </div>
  )
}

function LabeledCode(props: { label: string; value: string }) {
  return (
    <div className='space-y-1.5'>
      <div className='text-[10px] text-slate-500'>{props.label}</div>
      <CodePanel value={props.value} compact />
    </div>
  )
}

function ConnectionRow(props: {
  label: string
  value: string
  copyValue?: string
}) {
  const { t } = useTranslation()
  return (
    <div className='grid min-h-10 grid-cols-[78px_minmax(0,1fr)_28px] items-center gap-2 text-xs'>
      <span className='text-slate-500'>{t(props.label)}</span>
      <code className='truncate text-slate-200'>{props.value}</code>
      <CopyButton
        value={props.copyValue ?? props.value}
        className='size-7 text-slate-500 hover:bg-white/[0.06] hover:text-white'
        tooltip={t('Copy')}
      />
    </div>
  )
}

function Disclosure(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  children: ReactNode
}) {
  return (
    <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
      <CollapsibleTrigger className='group flex items-center gap-1.5 text-[11px] text-slate-500 transition-colors hover:text-slate-300'>
        <ChevronDown className='size-3 transition-transform group-aria-expanded:rotate-180' />
        {props.label}
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-2'>{props.children}</CollapsibleContent>
    </Collapsible>
  )
}

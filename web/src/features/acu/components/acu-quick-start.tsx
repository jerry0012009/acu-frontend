import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightLeft,
  Bot,
  ChevronDown,
  CircleCheck,
  Code2,
  Download,
  Monitor,
  KeyRound,
  ExternalLink,
  Image as ImageIcon,
  Settings2,
  TableProperties,
  Terminal,
  Video,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import {
  ACU_API_BASE_URL,
  ACU_DEFAULT_MODEL,
  ACU_MASKED_API_KEY,
  CC_SWITCH_CLAUDE_API_BASE_URL,
  CC_SWITCH_CODEX_API_BASE_URL,
  CC_SWITCH_MODEL_MAPPINGS,
  WORKBUDDY_CHAT_COMPLETIONS_ENDPOINT,
  WORKBUDDY_PROVIDER,
  buildApiCurl,
  buildHermesConfig,
  buildManualConfig,
  buildOpenClawConfig,
  buildPowerShellFallbackInstallCommand,
  buildPowerShellInstallCommand,
  buildUnixFallbackInstallCommand,
  buildUnixInstallCommand,
  displayCredentialText,
  displayCredentialValue,
  buildWindowsCommandPromptInstall,
  getLaunchCommand,
  getCodexBootstrapperUrl,
  getProtocolEndpoint,
  normalizeAcuQuickStartMedia,
  normalizeApiKey,
  type AcuQuickStartMedia,
  type AcuQuickStartMode,
  type AcuApiProtocol,
  type AcuClient,
} from '../lib/quick-start'
import { RuntimeQuickStart } from './runtime-quick-start'

import './connect-experience.css'

export type AcuQuickStartTab =
  | 'runtime'
  | 'codex'
  | 'claude'
  | 'ccswitch'
  | 'api'
  | 'agent'
type Platform = 'unix' | 'windows'
type Agent = 'openclaw' | 'hermes' | 'workbuddy'
type ClientConnectionMode = 'install' | 'manual'

type AcuQuickStartProps = {
  mode: AcuQuickStartMode
  tokenKey?: string
  className?: string
  onOpenCCSwitch?: () => void
  initialTab?: AcuQuickStartTab
  connectionSummary?: ReactNode
}

const PRIMARY_TABS: Array<{
  value: AcuQuickStartTab
  label: string
  icon: typeof Terminal
}> = [
  { value: 'codex', label: 'Codex CLI', icon: Terminal },
  { value: 'claude', label: 'Claude Code', icon: Code2 },
  { value: 'ccswitch', label: 'CC Switch', icon: ArrowRightLeft },
  { value: 'api', label: 'API / SDK', icon: ExternalLink },
  { value: 'agent', label: 'AI Agent', icon: Bot },
]

export function AcuQuickStart(props: AcuQuickStartProps) {
  const { t } = useTranslation()
  const [primaryTab, setPrimaryTab] = useState<AcuQuickStartTab>(
    props.initialTab ?? 'runtime'
  )
  const copyKey =
    props.mode === 'credentialed' && props.tokenKey
      ? normalizeApiKey(props.tokenKey)
      : ACU_MASKED_API_KEY

  useEffect(() => {
    if (props.initialTab) setPrimaryTab(props.initialTab)
  }, [props.initialTab])

  return (
    <section
      className={cn(
        'acu-connect-experience mx-auto w-full max-w-2xl',
        props.className
      )}
    >
      <div className='acu-connect-heading'>
        <h2>{t('Start using ACU')}</h2>
        <p>
          {t('Connect your apps with ACU Runtime, or use an API key directly.')}
        </p>
      </div>

      <div
        className='acu-connection-switch'
        role='group'
        aria-label={t('Connection method')}
      >
        <Button
          variant={primaryTab === 'runtime' ? 'secondary' : 'ghost'}
          onClick={() => setPrimaryTab('runtime')}
          aria-pressed={primaryTab === 'runtime'}
          className='acu-connection-option'
        >
          <Monitor aria-hidden='true' />
          ACU Runtime
        </Button>
        <Button
          variant={primaryTab !== 'runtime' ? 'secondary' : 'ghost'}
          onClick={() => setPrimaryTab('api')}
          aria-pressed={primaryTab !== 'runtime'}
          className='acu-connection-option'
        >
          <KeyRound aria-hidden='true' />
          {t('API key & terminal')}
        </Button>
      </div>
      {primaryTab === 'runtime' ? (
        <RuntimeQuickStart onDirect={() => setPrimaryTab('api')} />
      ) : (
        <>
          {props.connectionSummary}
          <div className='acu-client-tool'>
            <Tabs
              value={primaryTab}
              onValueChange={(value) => {
                if (value) setPrimaryTab(value as AcuQuickStartTab)
              }}
              className='gap-0'
            >
              <div className='border-border overflow-x-auto border-b'>
                <TabsList
                  variant='line'
                  className='text-muted-foreground h-12 min-w-max gap-0 px-2'
                >
                  {PRIMARY_TABS.map((tab) => {
                    const Icon = tab.icon
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className='text-muted-foreground after:bg-primary data-active:text-foreground h-12 min-w-[110px] gap-1.5 rounded-none px-3 text-xs sm:min-w-0 sm:flex-1'
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
                  <ClientQuickStart
                    client='codex'
                    copyKey={copyKey}
                    mode={props.mode}
                  />
                </TabsContent>
                <TabsContent value='claude' className='m-0'>
                  <ClientQuickStart
                    client='claude'
                    copyKey={copyKey}
                    mode={props.mode}
                  />
                </TabsContent>
                <TabsContent value='ccswitch' className='m-0'>
                  <CCSwitchQuickStart
                    mode={props.mode}
                    copyKey={copyKey}
                    onOpenCCSwitch={props.onOpenCCSwitch}
                  />
                </TabsContent>
                <TabsContent value='api' className='m-0'>
                  <ApiQuickStart
                    mode={props.mode}
                    copyKey={copyKey}
                    onOpenCCSwitch={props.onOpenCCSwitch}
                  />
                </TabsContent>
                <TabsContent value='agent' className='m-0'>
                  <AgentQuickStart copyKey={copyKey} mode={props.mode} />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </>
      )}
    </section>
  )
}

function ClientQuickStart(props: {
  client: AcuClient
  copyKey: string
  mode: AcuQuickStartMode
}) {
  const { t } = useTranslation()
  const [connectionMode, setConnectionMode] = useState<ClientConnectionMode>(
    props.mode === 'credentialed' ? 'manual' : 'install'
  )
  const [platform, setPlatform] = useState<Platform>('unix')
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const [otherInstallOpen, setOtherInstallOpen] = useState(false)
  const launchCommand = getLaunchCommand(props.client)
  const canonicalCommand =
    platform === 'unix'
      ? buildUnixInstallCommand(props.client, props.copyKey)
      : buildPowerShellInstallCommand(props.client, props.copyKey)
  const fallbackCommand =
    platform === 'unix'
      ? buildUnixFallbackInstallCommand(props.client, props.copyKey)
      : buildPowerShellFallbackInstallCommand(props.client, props.copyKey)
  const displayCanonicalCommand = displayCredentialText(
    canonicalCommand,
    props.copyKey,
    props.mode
  )
  const displayFallbackCommand = displayCredentialText(
    fallbackCommand,
    props.copyKey,
    props.mode
  )
  const manualConfig = buildManualConfig(props.client, props.copyKey)
  return (
    <div className='p-4 sm:p-5'>
      <ConnectionModeSelector
        value={connectionMode}
        onChange={(value) => setConnectionMode(value as ClientConnectionMode)}
      />

      {connectionMode === 'install' ? (
        <div className='mt-5 space-y-4'>
          <SecondarySelector
            value={platform}
            onChange={(value) => setPlatform(value as Platform)}
            items={[
              { value: 'unix', label: 'macOS / Linux / WSL' },
              { value: 'windows', label: 'Windows PowerShell' },
            ]}
          />

          <Step
            number='01'
            label={t(platform === 'windows' ? 'Windows PowerShell' : 'Install')}
          >
            {props.client === 'codex' && props.mode === 'credentialed' ? (
              <div className='mb-3 flex flex-wrap items-center gap-2'>
                <a
                  className='bg-secondary text-secondary-foreground hover:bg-secondary/80 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium transition-colors'
                  href={getCodexBootstrapperUrl(
                    platform === 'windows' ? 'windows' : 'macos'
                  )}
                  download
                >
                  <Download className='size-4' />
                  {t(
                    platform === 'windows'
                      ? 'Download Codex ACU for Windows'
                      : 'Download Codex ACU for macOS'
                  )}
                </a>
                <span className='text-muted-foreground text-[11px]'>
                  {t('The installer will ask for this API key once.')}
                </span>
              </div>
            ) : null}
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
                label={t('Windows Command Prompt')}
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

          <div className='border-border text-muted-foreground flex items-center gap-2 border-t pt-4 text-xs'>
            <CircleCheck className='size-3.5 text-emerald-400' />
            {props.client === 'codex'
              ? t('Coexists with native Codex · Uses ACU Auto by default')
              : t(
                  'Coexists with native Claude Code · Uses ACU Auto by default'
                )}
          </div>
          {props.client === 'codex' ? (
            <p className='text-muted-foreground pl-5 text-[11px]'>
              {t('Switch supported ACU models with /model.')}
            </p>
          ) : null}
        </div>
      ) : (
        <ManualClientConfig
          client={props.client}
          copyKey={props.copyKey}
          config={manualConfig}
          mode={props.mode}
        />
      )}
    </div>
  )
}

function ManualClientConfig(props: {
  client: AcuClient
  copyKey: string
  config: string
  mode: AcuQuickStartMode
}) {
  const { t } = useTranslation()
  const baseUrl =
    props.client === 'codex' ? ACU_API_BASE_URL : CC_SWITCH_CLAUDE_API_BASE_URL

  return (
    <div className='mt-5 space-y-4'>
      <div className='border-primary/15 bg-muted/50 text-foreground rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed'>
        {props.client === 'codex'
          ? t(
              'Keep your existing Codex CLI. Set the Base URL and API Key below in its provider configuration.'
            )
          : t(
              'Keep your existing Claude Code. Set the Base URL and API Key below in its environment or settings.'
            )}
      </div>

      <div className='divide-border border-border divide-y border-y'>
        <ConnectionRow label='Base URL' value={baseUrl} copyValue={baseUrl} />
        <ConnectionRow
          label='API Key'
          value={displayCredentialValue(props.copyKey, props.mode)}
          copyValue={props.copyKey}
        />
        <ConnectionRow label='Model' value={ACU_DEFAULT_MODEL} />
      </div>

      <Step number='01' label={t('Copy the matching configuration')}>
        <CodePanel
          value={props.config}
          displayValue={displayCredentialText(
            props.config,
            props.copyKey,
            props.mode
          )}
          copyLabel={t(
            props.copyKey === ACU_MASKED_API_KEY
              ? 'Copy template'
              : 'Copy configuration'
          )}
          minHeight='min-h-[180px]'
        />
      </Step>

      <p className='text-muted-foreground text-[11px] leading-relaxed'>
        {props.client === 'codex'
          ? t(
              'Codex uses the Responses endpoint with /v1. Claude Code uses the Messages endpoint on the same host without /v1.'
            )
          : t(
              'Claude Code uses the Messages endpoint on the same host without /v1. No separate claude-acu installation is required.'
            )}
      </p>
    </div>
  )
}

function CCSwitchQuickStart(props: {
  mode: AcuQuickStartMode
  copyKey: string
  onOpenCCSwitch?: () => void
}) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(true)

  return (
    <div className='p-4 sm:p-5'>
      <div className='mb-4 flex items-start gap-3'>
        <div className='border-primary/20 bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold'>
          CC
        </div>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='text-foreground text-sm font-semibold'>
              {t('CC Switch connection')}
            </h3>
            <span className='rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-0.5 text-[10px] font-medium text-emerald-200'>
              {t('Codex + Claude')}
            </span>
          </div>
          <p className='text-muted-foreground mt-1 text-[11px] leading-relaxed'>
            {t(
              'Use the values below in CC Switch. The advanced mapping keeps the model names shown by Codex stable.'
            )}
          </p>
        </div>
      </div>

      <div className='divide-border border-border divide-y border-y'>
        <ConnectionRow
          label='API Key'
          value={displayCredentialValue(props.copyKey, props.mode)}
          copyValue={props.copyKey}
        />
        <ConnectionRow
          label='API request address'
          value={CC_SWITCH_CODEX_API_BASE_URL}
          copyValue={CC_SWITCH_CODEX_API_BASE_URL}
        />
      </div>

      <p className='text-muted-foreground mt-2 text-[11px] leading-relaxed'>
        {t(
          'Codex uses /v1. Claude Code uses the same host without /v1; the import button fills the matching address for the selected app.'
        )}
      </p>

      <div className='mt-4 flex flex-wrap gap-2'>
        {props.mode === 'credentialed' && props.onOpenCCSwitch ? (
          <Button
            type='button'
            size='sm'
            onClick={props.onOpenCCSwitch}
            className='bg-primary text-primary-foreground hover:bg-primary/85 h-8 gap-1.5 px-3 text-xs'
          >
            <ArrowRightLeft className='size-3.5' />
            {t('Import to CC Switch')}
          </Button>
        ) : (
          <a
            href='https://ccswitch.io'
            target='_blank'
            rel='noopener noreferrer'
            className='border-primary/20 bg-primary/10 text-primary hover:bg-primary/15 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors'
          >
            <ExternalLink className='size-3.5' />
            {t('Open CC Switch')}
          </a>
        )}
        <span className='border-border text-muted-foreground inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px]'>
          <Settings2 className='size-3.5' />
          {t('Advanced mapping below')}
        </span>
      </div>

      <div className='border-border mt-5 border-t pt-4'>
        <Disclosure
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          label={t('Advanced options · Model mapping')}
        >
          <div className='border-border bg-muted/30 mt-3 overflow-x-auto rounded-lg border'>
            <table className='w-full min-w-[500px] border-collapse text-left text-[11px]'>
              <thead>
                <tr className='border-border text-muted-foreground border-b'>
                  <th className='px-3 py-2.5 font-medium'>
                    {t('Menu display name')}
                  </th>
                  <th className='px-3 py-2.5 font-medium'>
                    {t('Actual request model')}
                  </th>
                  <th className='px-3 py-2.5 text-right font-medium'>
                    {t('Context window')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {CC_SWITCH_MODEL_MAPPINGS.map((mapping) => (
                  <tr
                    key={mapping.menuName}
                    className='border-border border-b last:border-0'
                  >
                    <td className='text-foreground px-3 py-2 font-mono'>
                      {mapping.menuName}
                    </td>
                    <td className='text-muted-foreground px-3 py-2 font-mono'>
                      {mapping.requestModel}
                    </td>
                    <td className='text-muted-foreground px-3 py-2 text-right font-mono'>
                      {mapping.contextWindow}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className='text-muted-foreground mt-3 flex items-start gap-2 text-[11px] leading-relaxed'>
            <TableProperties className='text-primary mt-0.5 size-3.5 shrink-0' />
            <p>
              {t(
                'This generates Codex model_catalog_json so /model can show these third-party model names. Save the mapping, then restart Codex to refresh the list.'
              )}
            </p>
          </div>
        </Disclosure>
      </div>

      <div className='mt-4 grid gap-2 sm:grid-cols-2'>
        <div className='border-border bg-muted/30 rounded-lg border px-3 py-2.5'>
          <div className='text-muted-foreground text-[10px] font-medium tracking-normal uppercase'>
            {t('Codex endpoint')}
          </div>
          <code className='text-foreground mt-1 block truncate text-[11px]'>
            {CC_SWITCH_CODEX_API_BASE_URL}
          </code>
        </div>
        <div className='border-border bg-muted/30 rounded-lg border px-3 py-2.5'>
          <div className='text-muted-foreground text-[10px] font-medium tracking-normal uppercase'>
            {t('Claude endpoint')}
          </div>
          <code className='text-foreground mt-1 block truncate text-[11px]'>
            {CC_SWITCH_CLAUDE_API_BASE_URL}
          </code>
        </div>
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
      <div className='divide-border border-border divide-y border-y'>
        <ConnectionRow label='Base URL' value={ACU_API_BASE_URL} />
        <ConnectionRow
          label='API Key'
          value={displayCredentialValue(props.copyKey, props.mode)}
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
          ]}
        />
      </div>

      <div className='mt-4 space-y-3'>
        <div className='text-muted-foreground flex items-center gap-2 text-xs'>
          <span className='rounded bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300'>
            POST
          </span>
          <code>{getProtocolEndpoint(protocol)}</code>
        </div>
        <CodePanel
          value={buildApiCurl(protocol, props.copyKey)}
          displayValue={displayCredentialText(
            buildApiCurl(protocol, props.copyKey),
            props.copyKey,
            props.mode
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

      <div className='border-border mt-5 border-t pt-4'>
        <div className='text-muted-foreground mb-2 text-[10px] font-semibold tracking-normal uppercase'>
          {t('Compatible clients')}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <a
            href='https://cherry-ai.com'
            target='_blank'
            rel='noopener noreferrer'
            className='border-border text-foreground hover:border-foreground/20 hover:bg-muted/50 flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors'
          >
            <CherryStudio.Color size={16} />
            Cherry Studio
          </a>
          {props.mode === 'credentialed' && props.onOpenCCSwitch ? (
            <button
              type='button'
              onClick={props.onOpenCCSwitch}
              className='border-border text-foreground hover:border-foreground/20 hover:bg-muted/50 flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors'
            >
              <span className='bg-primary/10 text-primary flex size-4 items-center justify-center rounded text-[8px] font-bold'>
                CC
              </span>
              CC Switch
            </button>
          ) : (
            <Button
              variant='ghost'
              size='sm'
              className='border-border text-foreground hover:bg-muted/50 hover:text-foreground h-8 border bg-transparent px-2.5 text-xs'
              render={<Link to='/keys' />}
            >
              <span className='bg-primary/10 text-primary flex size-4 items-center justify-center rounded text-[8px] font-bold'>
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

function AgentQuickStart(props: { copyKey: string; mode: AcuQuickStartMode }) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [agent, setAgent] = useState<Agent>('openclaw')
  const tutorialMedia = normalizeAcuQuickStartMedia(
    status?.acu_quick_start_media
  )

  if (agent === 'workbuddy') {
    return (
      <div className='p-4 sm:p-5'>
        <SecondarySelector
          value={agent}
          onChange={(value) => setAgent(value as Agent)}
          items={[
            { value: 'openclaw', label: 'OpenClaw' },
            { value: 'hermes', label: 'Hermes' },
            { value: 'workbuddy', label: 'WorkBuddy' },
          ]}
        />
        <WorkBuddyQuickStart
          copyKey={props.copyKey}
          mode={props.mode}
          media={tutorialMedia}
        />
      </div>
    )
  }

  const config =
    agent === 'openclaw'
      ? buildOpenClawConfig(props.copyKey)
      : buildHermesConfig(props.copyKey)
  const displayConfig = displayCredentialText(config, props.copyKey, props.mode)
  const protocol = agent === 'openclaw' ? 'openai-responses' : 'codex_responses'

  return (
    <div className='p-4 sm:p-5'>
      <SecondarySelector
        value={agent}
        onChange={(value) => setAgent(value as Agent)}
        items={[
          { value: 'openclaw', label: 'OpenClaw' },
          { value: 'hermes', label: 'Hermes' },
          { value: 'workbuddy', label: 'WorkBuddy' },
        ]}
      />

      <div className='border-border mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y py-3 text-xs'>
        <span className='text-muted-foreground'>Base URL</span>
        <code className='text-foreground truncate text-right'>
          {ACU_API_BASE_URL}
        </code>
        <span className='text-muted-foreground'>Model</span>
        <code className='text-foreground text-right'>{ACU_DEFAULT_MODEL}</code>
        <span className='text-muted-foreground'>Protocol</span>
        <code className='text-foreground text-right'>{protocol}</code>
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
      <p className='text-muted-foreground mt-3 text-[11px] leading-relaxed'>
        {t(
          'This config makes the agent itself use ACU Auto as its model provider.'
        )}
      </p>
    </div>
  )
}

function WorkBuddyQuickStart(props: {
  copyKey: string
  mode: AcuQuickStartMode
  media: AcuQuickStartMedia[]
}) {
  const { t } = useTranslation()

  return (
    <div className='mt-5 space-y-5'>
      <div className='flex items-start gap-3'>
        <div className='border-primary/20 bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold'>
          WB
        </div>
        <div className='min-w-0'>
          <h3 className='text-foreground text-sm font-semibold'>
            {t('WorkBuddy connection')}
          </h3>
          <p className='text-muted-foreground mt-1 text-[11px] leading-relaxed'>
            {t('Add ACU as a custom OpenAI-compatible model in WorkBuddy.')}
          </p>
        </div>
      </div>

      <ol className='space-y-3'>
        {[
          'Open the model dropdown on the left side of the chat box.',
          'Scroll to the bottom and select Configure custom models.',
          'Choose Custom as the provider and enter the values below.',
          'Keep the other settings unchanged, save, then select the model from Custom Models.',
        ].map((label, index) => (
          <li key={label} className='flex items-start gap-3'>
            <span className='border-primary/20 bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]'>
              {index + 1}
            </span>
            <span className='text-foreground pt-0.5 text-xs leading-relaxed'>
              {t(label)}
            </span>
          </li>
        ))}
      </ol>

      <div className='divide-border border-border divide-y border-y'>
        <ConnectionRow label='Provider' value={WORKBUDDY_PROVIDER} />
        <ConnectionRow
          label='Endpoint'
          value={WORKBUDDY_CHAT_COMPLETIONS_ENDPOINT}
          copyValue={WORKBUDDY_CHAT_COMPLETIONS_ENDPOINT}
        />
        <ConnectionRow
          label='API Key'
          value={displayCredentialValue(props.copyKey, props.mode)}
          copyValue={props.copyKey}
        />
        <ConnectionRow label='Model name' value={ACU_DEFAULT_MODEL} />
        <ConnectionRow label='Protocol' value='OpenAI Chat Completions' />
      </div>

      <div className='border-primary/15 bg-muted/50 text-foreground rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed'>
        {t(
          'Use acu-auto for automatic routing. If you prefer one fixed model, enter its ACU model name, such as gpt-5.6-sol.'
        )}
      </div>

      {props.media.length > 0 ? (
        <WorkBuddyMediaCarousel media={props.media} />
      ) : null}
    </div>
  )
}

function WorkBuddyMediaCarousel(props: { media: AcuQuickStartMedia[] }) {
  const { t } = useTranslation()

  return (
    <div className='border-border border-t pt-4'>
      <div className='mb-3 flex items-center gap-2'>
        <ImageIcon className='text-primary size-3.5' />
        <span className='text-foreground text-xs font-medium'>
          {t('Visual setup guide')}
        </span>
      </div>
      <Carousel className='px-8' opts={{ loop: props.media.length > 1 }}>
        <CarouselContent>
          {props.media.map((item, index) => (
            <CarouselItem key={item.id ?? `${item.url}-${index}`}>
              <figure className='border-border bg-muted/40 overflow-hidden rounded-lg border'>
                <div className='bg-muted/60 flex aspect-video items-center justify-center'>
                  {item.type === 'video' ? (
                    <video
                      controls
                      preload='metadata'
                      poster={item.poster || undefined}
                      className='h-full w-full object-contain'
                    >
                      <source src={item.url} />
                    </video>
                  ) : (
                    <img
                      src={item.url}
                      alt={item.title || t('WorkBuddy setup step')}
                      loading='lazy'
                      className='h-full w-full object-contain'
                    />
                  )}
                </div>
                {item.title || item.description ? (
                  <figcaption className='space-y-1 px-3 py-2.5'>
                    {item.title ? (
                      <div className='text-foreground flex items-center gap-1.5 text-xs font-medium'>
                        {item.type === 'video' ? (
                          <Video className='text-primary size-3.5' />
                        ) : null}
                        {item.title}
                      </div>
                    ) : null}
                    {item.description ? (
                      <p className='text-muted-foreground text-[11px] leading-relaxed'>
                        {item.description}
                      </p>
                    ) : null}
                  </figcaption>
                ) : null}
              </figure>
            </CarouselItem>
          ))}
        </CarouselContent>
        {props.media.length > 1 ? (
          <>
            <CarouselPrevious className='border-border bg-muted/60 text-foreground hover:bg-muted left-0' />
            <CarouselNext className='border-border bg-muted/60 text-foreground hover:bg-muted right-0' />
          </>
        ) : null}
      </Carousel>
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
    <div className='bg-muted/50 flex max-w-full gap-1 overflow-x-auto rounded-md p-1'>
      {props.items.map((item) => (
        <button
          key={item.value}
          type='button'
          onClick={() => props.onChange(item.value)}
          aria-pressed={props.value === item.value}
          className={cn(
            'h-7 shrink-0 rounded px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors',
            props.value === item.value
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t(item.label)}
        </button>
      ))}
    </div>
  )
}

function ConnectionModeSelector(props: {
  value: ClientConnectionMode
  onChange: (value: ClientConnectionMode) => void
}) {
  const { t } = useTranslation()
  const options: Array<{
    value: ClientConnectionMode
    label: string
    description: string
    icon: typeof Terminal
  }> = [
    {
      value: 'manual',
      label: 'Base URL / API Key',
      description: 'Configure the client yourself',
      icon: Settings2,
    },
    {
      value: 'install',
      label: 'One-click install',
      description: 'Install the ACU helper',
      icon: Terminal,
    },
  ]

  return (
    <div className='border-border border-b pb-4'>
      <div className='mb-2.5 flex items-center gap-2'>
        <Settings2 className='text-primary size-4' />
        <span className='text-foreground text-xs font-semibold'>
          {t('Connection method')}
        </span>
      </div>
      <div
        role='group'
        aria-label={t('Connection method')}
        className='grid gap-2 sm:grid-cols-2'
      >
        {options.map((option) => {
          const Icon = option.icon
          const selected = props.value === option.value
          return (
            <button
              key={option.value}
              type='button'
              aria-pressed={selected}
              onClick={() => props.onChange(option.value)}
              className={cn(
                'flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-md border',
                  selected
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-muted/50 text-muted-foreground'
                )}
              >
                <Icon className='size-4' />
              </span>
              <span className='min-w-0'>
                <span className='block text-xs font-semibold'>
                  {t(option.label)}
                </span>
                <span className='text-muted-foreground mt-0.5 block text-[11px]'>
                  {t(option.description)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Step(props: { number: string; label: string; children: ReactNode }) {
  return (
    <div>
      <div className='mb-2 flex items-center gap-2'>
        <span className='text-primary font-mono text-[10px]'>
          {props.number}
        </span>
        <span className='text-foreground text-xs font-medium'>
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
        'relative overflow-hidden rounded-lg border border-border bg-muted/40',
        props.minHeight
      )}
    >
      <pre
        className={cn(
          'overflow-x-auto p-3 pr-11 font-mono text-[11px] leading-[1.65] text-foreground',
          props.compact ? 'max-h-40' : 'max-h-72'
        )}
      >
        <code>{props.displayValue ?? props.value}</code>
      </pre>
      <CopyButton
        value={props.value}
        className='text-muted-foreground hover:bg-muted hover:text-foreground absolute top-2 right-2 size-7'
        tooltip={props.copyLabel ?? t('Copy')}
      />
    </div>
  )
}

function LabeledCode(props: { label: string; value: string }) {
  return (
    <div className='space-y-1.5'>
      <div className='text-muted-foreground text-[10px]'>{props.label}</div>
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
      <span className='text-muted-foreground'>{t(props.label)}</span>
      <code className='text-foreground truncate'>{props.value}</code>
      <CopyButton
        value={props.copyValue ?? props.value}
        className='text-muted-foreground hover:bg-muted hover:text-foreground size-7'
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
      <CollapsibleTrigger className='group text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[11px] transition-colors'>
        <ChevronDown className='size-3 transition-transform group-aria-expanded:rotate-180' />
        {props.label}
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-2'>{props.children}</CollapsibleContent>
    </Collapsible>
  )
}

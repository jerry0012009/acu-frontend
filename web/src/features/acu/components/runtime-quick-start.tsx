import {
  Download,
  ArrowRight,
  ExternalLink,
  Monitor,
  Terminal,
  Code2,
  Bot,
  Layers,
  LogIn,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import {
  RUNTIME_RELEASE_URL,
  RUNTIME_VERSION,
  detectRuntimePlatform,
  runtimeDownloadUrl,
  type RuntimePlatform,
} from '../lib/runtime-onboarding'

export function RuntimeQuickStart(props: {
  onDirect: () => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState<RuntimePlatform>(() =>
    detectRuntimePlatform(
      typeof navigator === 'undefined' ? '' : navigator.userAgent
    )
  )
  const [downloaded, setDownloaded] = useState(false)
  let platformNote = 'API key & terminal'
  if (platform === 'windows') {
    platformNote = 'Windows x64 · No administrator access required'
  } else if (platform !== 'other') {
    platformNote = 'macOS 12 or later · Select the chip used by your Mac'
  }
  const labels = {
    windows: 'Windows 10 / 11 · x64',
    'mac-arm': 'macOS · Apple Silicon',
    'mac-intel': 'macOS · Intel',
    other: 'Linux / Other devices',
  }
  return (
    <div className='acu-runtime-flow'>
      <div className='acu-runtime-heading'>
        <img
          src='/acu-runtime-icon.png'
          width={48}
          height={48}
          alt=''
          className='acu-runtime-mark'
        />
        <div>
          <div className='acu-runtime-title-row'>
            <h3>ACU Runtime</h3>
            <span className='acu-release-tag'>v{RUNTIME_VERSION}</span>
          </div>
          <p className='acu-runtime-subtitle'>
            {t('Your local ACU connection assistant')}
          </p>
        </div>
      </div>
      <div className='acu-runtime-intro'>
        <h4>{t('Connect ACU to your everyday apps')}</h4>
        <p>
          {t(
            'Configure ACU models and tools for Codex, Claude Code, Hermes and WorkBuddy already on your computer.'
          )}
        </p>
      </div>
      <div
        className='acu-app-list'
        aria-label='Codex / Claude Code / Hermes / WorkBuddy'
      >
        {[
          { name: 'Codex', icon: Terminal },
          { name: 'Claude Code', icon: Code2 },
          { name: 'Hermes', icon: Bot },
          { name: 'WorkBuddy', icon: Layers },
        ].map((app) => (
          <span key={app.name}>
            <app.icon aria-hidden='true' />
            <span>{app.name}</span>
          </span>
        ))}
      </div>
      <div className='acu-download-area'>
        <label htmlFor='runtime-platform' className='acu-field-label'>
          {t('Your device')}
        </label>
        <div className='acu-download-controls'>
          <div className='acu-platform-field'>
            <Monitor aria-hidden='true' className='size-4' />
            <select
              id='runtime-platform'
              value={platform}
              onChange={(event) => {
                setPlatform(event.target.value as RuntimePlatform)
                setDownloaded(false)
              }}
              className='acu-platform-select'
            >
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </div>
          {platform !== 'other' ? (
            <Button
              render={
                <a
                  href={runtimeDownloadUrl(platform)}
                  onClick={() => setDownloaded(true)}
                />
              }
              className='acu-download-button'
            >
              <Download className='size-4' />
              {t('Download ACU Runtime')}
            </Button>
          ) : (
            <div className='acu-platform-fallback'>
              <p>
                {t(
                  'Use a terminal installer or API key on Linux, servers and unsupported devices.'
                )}
              </p>
            </div>
          )}
        </div>
        <div className='acu-download-meta'>
          <span>{t(platformNote)}</span>
          <a href={RUNTIME_RELEASE_URL} target='_blank' rel='noreferrer'>
            {t('Release notes & installation help')}
            <ExternalLink aria-hidden='true' />
          </a>
        </div>
      </div>
      <div className='acu-download-status' role='status' aria-live='polite'>
        {downloaded ? (
          <p>
            {t(
              'After downloading, install and open ACU Runtime. Continue with the steps below.'
            )}
          </p>
        ) : null}
      </div>
      {props.compact ? (
        <details className='acu-compact-steps'>
          <summary>
            <span>{t('Three steps to get started')}</span>
            <ChevronRight aria-hidden='true' />
          </summary>
          <RuntimeSetupSteps />
        </details>
      ) : (
        <RuntimeSetupSteps />
      )}
      {!props.compact ? (
        <div className='acu-runtime-alternative'>
          <Button
            variant='link'
            className='acu-direct-link'
            onClick={props.onDirect}
          >
            {t('Use an API key or terminal instead')}
            <ArrowRight className='ml-1 size-4' />
          </Button>
        </div>
      ) : null}
      <RuntimeInstallNotes />
    </div>
  )
}

function RuntimeSetupSteps() {
  const { t } = useTranslation()
  return (
    <ol className='acu-setup-steps'>
      {[
        [
          'Open ACU Runtime',
          'Install the app, then open it from your applications.',
        ],
        [
          'Connect your account',
          'Sign in to ACU, or paste an existing API key.',
        ],
        [
          'Choose your apps',
          'Confirm configuration, then reopen the selected apps when prompted.',
        ],
      ].map(([title, description], index) => {
        const StepIcon = [Download, LogIn, SlidersHorizontal][index]
        return (
          <li key={title}>
            <div className='acu-step-top'>
              <span className='acu-step-icon'>
                <StepIcon />
              </span>
              <span className='acu-step-number'>0{index + 1}</span>
            </div>
            <p className='acu-step-title'>{t(title)}</p>
            <p className='acu-step-description'>{t(description)}</p>
          </li>
        )
      })}
    </ol>
  )
}

function RuntimeInstallNotes() {
  const { t } = useTranslation()
  return (
    <details className='acu-install-notes'>
      <summary>
        <span>{t('Before you install')}</span>
        <ChevronRight aria-hidden='true' />
      </summary>
      <div className='acu-install-notes-body'>
        <p>
          {t(
            'Need an app first? Install it from its official website, open it once, then return to Runtime.'
          )}
        </p>
        <div className='flex flex-wrap gap-x-4 gap-y-2'>
          {[
            ['Codex', 'https://developers.openai.com/codex/'],
            ['Claude Code', 'https://code.claude.com/docs/en/overview'],
            ['Hermes', 'https://github.com/NousResearch/hermes-agent'],
            ['WorkBuddy', 'https://www.codebuddy.ai/work/'],
          ].map(([name, href]) => (
            <a
              key={name}
              href={href}
              target='_blank'
              rel='noreferrer'
              className='underline underline-offset-4'
            >
              {name}
            </a>
          ))}
        </div>
        <p>
          {t(
            'Manual key connection: use https://api.acucompute.com/v1 in the API address field.'
          )}
        </p>
        <p>
          {t(
            'Runtime is optional. It configures existing apps after your confirmation; it does not install those apps or replace their chat interface.'
          )}
        </p>
        <p>
          {t(
            'Installers are not yet code-signed or Apple-notarized. Download only from the official release; do not disable system security.'
          )}
        </p>
        <p>
          {t(
            'Windows requires WebView2. Windows supports in-app updates; on Mac, replace the app with the new release.'
          )}
        </p>
        <p>
          {t(
            'Existing chats may keep their previous model. Choose an ACU model in the app; WorkBuddy keeps in-app model selection.'
          )}
        </p>
        <p>
          {t(
            'Configuration does not verify paid inference. Images and search depend on the selected model, tools and app permissions.'
          )}
        </p>
      </div>
    </details>
  )
}

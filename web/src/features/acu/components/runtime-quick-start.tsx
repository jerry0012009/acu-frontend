import { Download, ArrowRight, ExternalLink, Monitor } from 'lucide-react'
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

export function RuntimeQuickStart(props: { onDirect: () => void }) {
  const { t } = useTranslation()
  const [platform, setPlatform] = useState<RuntimePlatform>(() =>
    detectRuntimePlatform(
      typeof navigator === 'undefined' ? '' : navigator.userAgent
    )
  )
  const [downloaded, setDownloaded] = useState(false)
  const labels = {
    windows: 'Windows 10 / 11 · x64',
    'mac-arm': 'macOS · Apple Silicon',
    'mac-intel': 'macOS · Intel',
    other: 'Linux / Other devices',
  }
  return (
    <div className='space-y-7 py-5'>
      <div className='flex items-center gap-3'>
        <img
          src='/acu-runtime-icon.png'
          width={44}
          height={44}
          alt=''
          className='size-11 shrink-0 rounded-lg'
        />
        <div>
          <h3 className='text-xl font-semibold'>ACU Runtime</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Your local ACU connection assistant')}
          </p>
        </div>
      </div>
      <div className='max-w-xl space-y-2'>
        <h4 className='text-lg font-medium'>
          {t('Connect ACU to your everyday apps')}
        </h4>
        <p className='text-muted-foreground text-sm leading-6'>
          {t(
            'Configure ACU models and tools for Codex, Claude Code, Hermes and WorkBuddy already on your computer.'
          )}
        </p>
      </div>
      <div className='space-y-3'>
        <label htmlFor='runtime-platform' className='text-sm font-medium'>
          {t('Your device')}
        </label>
        <select
          id='runtime-platform'
          value={platform}
          onChange={(event) => {
            setPlatform(event.target.value as RuntimePlatform)
            setDownloaded(false)
          }}
          className='border-input bg-background block h-10 w-full max-w-sm rounded-md border px-3 text-sm'
        >
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
        {platform !== 'other' ? (
          <>
            <Button
              render={
                <a
                  href={runtimeDownloadUrl(platform)}
                  onClick={() => setDownloaded(true)}
                />
              }
              className='h-11 gap-2 px-5'
            >
              <Download className='size-4' />
              {t('Download ACU Runtime')}
            </Button>
            <p className='text-muted-foreground text-xs'>
              v{RUNTIME_VERSION} ·{' '}
              {platform === 'windows'
                ? t('Windows x64 · No administrator access required')
                : t('macOS 12 or later · Select the chip used by your Mac')}
            </p>
          </>
        ) : (
          <div className='border-border flex items-start gap-3 border-l-2 pl-4'>
            <Monitor className='mt-0.5 size-4 shrink-0' />
            <p className='text-muted-foreground text-sm'>
              {t(
                'Use a terminal installer or API key on Linux, servers and unsupported devices.'
              )}
            </p>
          </div>
        )}
      </div>
      {downloaded ? (
        <p role='status' className='text-sm'>
          {t(
            'After downloading, install and open ACU Runtime. Continue with the steps below.'
          )}
        </p>
      ) : null}
      <ol className='grid gap-5 border-y py-5 sm:grid-cols-3'>
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
        ].map(([title, description], index) => (
          <li key={title} className='min-w-0 space-y-2'>
            <span className='text-muted-foreground font-mono text-xs'>
              0{index + 1}
            </span>
            <p className='text-sm font-medium'>{t(title)}</p>
            <p className='text-muted-foreground text-xs leading-5'>
              {t(description)}
            </p>
          </li>
        ))}
      </ol>
      <div className='flex flex-wrap items-center gap-x-5 gap-y-3'>
        <Button variant='link' className='h-auto p-0' onClick={props.onDirect}>
          {t('Use an API key or terminal instead')}
          <ArrowRight className='ml-1 size-4' />
        </Button>
        <a
          href={RUNTIME_RELEASE_URL}
          target='_blank'
          rel='noreferrer'
          className='text-muted-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline'
        >
          {t('Release notes & installation help')}
          <ExternalLink className='size-3' />
        </a>
      </div>
      <details className='text-muted-foreground text-xs leading-5'>
        <summary className='cursor-pointer'>{t('Before you install')}</summary>
        <div className='mt-3 space-y-2'>
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
    </div>
  )
}

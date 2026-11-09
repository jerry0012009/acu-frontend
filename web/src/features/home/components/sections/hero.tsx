import { CherryStudio } from '@lobehub/icons'
import { Link, useLocation } from '@tanstack/react-router'
import { ArrowRight, Play, Route, ArrowUpRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { HeroTerminalDemo } from '../hero-terminal-demo'

import './usage-guide.css'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const accessRef = useRef<HTMLDetailsElement>(null)
  const hash = useLocation({ select: (location) => location.hash })
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === '#start' && accessRef.current) {
        accessRef.current.open = true
      }
    }
    const revealLink = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a')
      if (link?.getAttribute('href') === '/#start' && accessRef.current) {
        accessRef.current.open = true
      }
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    document.addEventListener('click', revealLink)
    return () => {
      window.removeEventListener('hashchange', reveal)
      document.removeEventListener('click', revealLink)
    }
  }, [hash])

  return (
    <section
      className={cn('acu-usage-guide', props.className)}
      aria-labelledby='acu-product-title'
    >
      <div className='acu-guide-layout'>
        <div className='acu-product-intro'>
          <p className='acu-product-category'>
            <Route aria-hidden='true' />
            {t('One connection. Your choice of AI.')}
          </p>
          <h1 id='acu-product-title'>
            ACU<span>index</span>
          </h1>
          <h2 className='acu-product-purpose'>
            <span>{t('One API.')}</span>
            <strong>{t('The right model for each task.')}</strong>
          </h2>
          <p className='acu-product-description'>
            {t(
              'Connect your AI tools to ACU. Balance quality, latency, and cost with task-aware routing, without rebuilding your workflow.'
            )}
          </p>
          <div className='acu-product-actions'>
            <Button
              render={
                <Link
                  to='/'
                  hash='start'
                  onClick={() => {
                    if (accessRef.current) accessRef.current.open = true
                  }}
                />
              }
              className='acu-product-console'
            >
              {t('Connect my tools')}
              <ArrowRight aria-hidden='true' />
            </Button>
            <Button
              render={<a href='https://demo.acucompute.com/' />}
              variant='ghost'
              className='acu-product-demo'
            >
              <Play aria-hidden='true' />
              {t('Product Demo')}
              <ArrowUpRight aria-hidden='true' />
            </Button>
            <Link to='/pricing' className='acu-product-pricing'>
              {t('View Pricing')}
            </Link>
          </div>
        </div>

        <div className='acu-product-evidence'>
          <p className='acu-mobile-product-description'>
            {t(
              'Connect your AI tools to ACU. Balance quality, latency, and cost with task-aware routing, without rebuilding your workflow.'
            )}
          </p>
          <div className='acu-workflow-compatibility'>
            <h3>{t('Compatible with existing workflows')}</h3>
            <p>
              {t(
                'Keep your existing calling patterns while supporting mainstream API protocols and common AI clients.'
              )}
            </p>
            <div className='acu-workflow-apps'>
              <a href='https://cherry-ai.com' target='_blank' rel='noreferrer'>
                <CherryStudio.Color size={18} aria-hidden='true' />
                <span>Cherry Studio</span>
              </a>
              <a href='https://ccswitch.io' target='_blank' rel='noreferrer'>
                <span className='acu-app-initial' aria-hidden='true'>
                  CC
                </span>
                <span>CC Switch</span>
              </a>
              <a href='https://openclaw.ai/' target='_blank' rel='noreferrer'>
                <img src='/brand/openclaw.svg' alt='' width={18} height={18} />
                <span>OpenClaw</span>
              </a>
              <a
                href='https://hermes-agent.nousresearch.com/'
                target='_blank'
                rel='noreferrer'
              >
                <img
                  src='/brand/hermes-agent.png'
                  alt=''
                  width={18}
                  height={18}
                />
                <span>Hermes</span>
              </a>
            </div>
          </div>
        </div>
      </div>
      <div className='acu-access-band'>
        <details ref={accessRef} id='start' className='acu-access-disclosure'>
          <summary>
            <span>
              <span className='acu-access-label'>{t('Start using ACU')}</span>
              <strong>{t('Your tools. Connected.')}</strong>
              <span>
                {t(
                  'Use Runtime for guided setup, or connect directly with an API key.'
                )}
              </span>
            </span>
            <ArrowRight aria-hidden='true' />
          </summary>
          <div className='acu-access-content'>
            <div className='acu-access-context'>
              <img src='/acu-runtime-icon.png' alt='' width={48} height={48} />
              <h3>{t('A simpler first connection')}</h3>
              <p>
                {t(
                  'Runtime is an optional desktop setup assistant. Sign in, choose your app, and confirm its connection to ACU.'
                )}
              </p>
              <p>
                {t(
                  'Prefer your own setup? API keys, terminal installers, and app-specific instructions remain available in the next tab.'
                )}
              </p>
              <Link
                to={props.isAuthenticated ? '/dashboard' : '/sign-up'}
                className='acu-story-link'
              >
                {t(props.isAuthenticated ? 'Go to console' : 'Create account')}
                <ArrowUpRight aria-hidden='true' />
              </Link>
            </div>
            <div className='acu-guide-access'>
              <HeroTerminalDemo className='max-w-none' />
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}

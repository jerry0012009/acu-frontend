import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Play,
  Route,
  ShieldCheck,
  ChartNoAxesCombined,
  ArrowUpRight,
} from 'lucide-react'
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

  return (
    <section
      className={cn('acu-usage-guide', props.className)}
      aria-labelledby='acu-product-title'
    >
      <div className='acu-guide-layout'>
        <div className='acu-product-intro'>
          <p className='acu-product-category'>
            <Route aria-hidden='true' />
            {t('ACU Router · Task-level AI Capacity Orchestration')}
          </p>
          <h1 id='acu-product-title'>
            ACU<span>index</span>
          </h1>
          <h2 className='acu-product-purpose'>
            <span>{t('Upgrade fixed-model calls to')}</span>
            <strong>{t('dynamic capacity orchestration')}</strong>
          </h2>
          <p className='acu-product-description'>
            {t(
              'With one interface and no changes to existing business workflows, upgrade every AI call into a measurable, controllable, and optimizable capacity orchestration decision.'
            )}
          </p>
          <div className='acu-product-actions'>
            <Button
              render={
                <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
              }
              className='acu-product-console'
            >
              {t(props.isAuthenticated ? 'Enter Console' : 'Get Started')}
              <ArrowRight aria-hidden='true' />
            </Button>
            <Button
              render={<a href='https://demo.acucompute.com/' />}
              variant='outline'
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

        <div className='acu-guide-access'>
          <HeroTerminalDemo className='max-w-none' />
        </div>

        <div className='acu-product-evidence'>
          <p className='acu-mobile-product-description'>
            {t(
              'With one interface and no changes to existing business workflows, upgrade every AI call into a measurable, controllable, and optimizable capacity orchestration decision.'
            )}
          </p>
          <dl className='acu-product-values'>
            {[
              {
                title: 'Dynamic Routing',
                description:
                  'Automatically match models and execution paths based on task difficulty, quality requirements, and cost.',
                icon: Route,
              },
              {
                title: 'Cost × Quality',
                description:
                  'Optimize the full cost of qualified results across quality, cost, and reliability.',
                icon: ChartNoAxesCombined,
              },
              {
                title: 'Result Assurance',
                description:
                  'Validate results through Validator and Fallback, retrying or upgrading the path when necessary.',
                icon: ShieldCheck,
              },
            ].map((value) => (
              <div key={value.title}>
                <dt>
                  <value.icon aria-hidden='true' />
                  <span>{t(value.title)}</span>
                </dt>
                <dd>{t(value.description)}</dd>
              </div>
            ))}
          </dl>
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
    </section>
  )
}

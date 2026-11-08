import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import './product-story.css'

export function HowItWorks() {
  const { t } = useTranslation()
  return (
    <section className='acu-process-story' aria-labelledby='acu-process-title'>
      <div className='acu-process-inner'>
        <header>
          <p className='acu-story-index'>{t('How It Works')}</p>
          <h2 id='acu-process-title'>{t('Three steps to get started')}</h2>
          <Link to='/' hash='start' className='acu-story-link'>
            {t('Start using ACU')}
            <ArrowRight aria-hidden='true' />
          </Link>
        </header>
        <ol>
          {[
            {
              title: 'Integrate',
              description:
                'Create an API key and connect to ACU without changing existing calling patterns.',
            },
            {
              title: 'Route',
              description:
                'ACU automatically selects models and execution paths based on the task and quality requirements.',
            },
            {
              title: 'Trace',
              description:
                'Review model selection, cost, quality, and Fallback records in the ACU routing trace.',
            },
          ].map((step, index) => (
            <li key={step.title}>
              <span className='acu-story-index'>0{index + 1}</span>
              <div>
                <h3>{t(step.title)}</h3>
                <p>{t(step.description)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

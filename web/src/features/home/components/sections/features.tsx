import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import './product-story.css'

interface FeaturesProps {
  className?: string
}

export function Features(props: FeaturesProps) {
  const { t } = useTranslation()
  return (
    <section
      className={cn('acu-product-story', props.className)}
      aria-labelledby='acu-capabilities-title'
    >
      <div className='acu-story-inner'>
        <header className='acu-story-heading'>
          <p>{t('Core Capabilities')}</p>
          <h2 id='acu-capabilities-title'>
            {t('Turn every AI call into')}
            <br />
            <span>{t('an optimizable capacity orchestration decision')}</span>
          </h2>
        </header>
        <div className='acu-story-composition'>
          <div className='acu-story-lead'>
            <span className='acu-story-index'>01 / ACU</span>
            <h3>{t('Dynamic Routing')}</h3>
            <p>
              {t(
                'Automatically match models and execution paths based on task difficulty, quality requirements, and cost.'
              )}
            </p>
            <div
              className='acu-story-models'
              aria-label='OpenAI / Claude / Gemini / DeepSeek / Qwen / Llama'
            >
              OpenAI <span>/</span> Claude <span>/</span> Gemini <span>/</span>{' '}
              DeepSeek <span>/</span> Qwen <span>/</span> Llama
            </div>
            <Link to='/public-acu' className='acu-story-link'>
              {t('Public ACU')}
              <ArrowUpRight aria-hidden='true' />
            </Link>
          </div>
          <div className='acu-story-chapters'>
            {[
              {
                title: 'Cost × Quality',
                description:
                  'Optimize the full cost of qualified results across quality, cost, and reliability.',
              },
              {
                title: 'Result Assurance',
                description:
                  'Validate results through Validator and Fallback, retrying or upgrading the path when necessary.',
              },
              {
                title: 'Compatible Integration',
                description:
                  'Keep existing API calling patterns while supporting mainstream model protocols and development workflows.',
              },
            ].map((chapter, index) => (
              <article key={chapter.title}>
                <span className='acu-story-index'>0{index + 2}</span>
                <div>
                  <h3>{t(chapter.title)}</h3>
                  <p>{t(chapter.description)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className='acu-story-details'>
          {[
            {
              title: 'Task Understanding',
              description:
                'Identify task type, difficulty, context, and quality requirements.',
            },
            {
              title: 'ACU Metering',
              description:
                'Compare the cost, quality, and capacity value of different models and paths.',
            },
            {
              title: 'Routing Trace',
              description:
                'Record every task assessment, model selection, cost, and execution result.',
            },
            {
              title: 'Quality Loop',
              description:
                'Continuously calibrate with Validator, Fallback, and historical feedback.',
            },
          ].map((detail) => (
            <details key={detail.title}>
              <summary>
                <span>{t(detail.title)}</span>
                <ChevronDown aria-hidden='true' />
              </summary>
              <p>{t(detail.description)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

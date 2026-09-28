import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Gauge,
  Route,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AcuQuickStart } from '@/features/acu/components/acu-quick-start'
import { ACUModelCurves } from '@/features/pricing/components/acu-model-curves'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'

const ROUTING_FACTORS = [
  { key: 'quality', icon: BadgeCheck },
  { key: 'price', icon: CircleDollarSign },
  { key: 'speed', icon: Timer },
  { key: 'reliability', icon: ShieldCheck },
] as const

export function PublicACUPage() {
  const { t } = useTranslation()
  const { models, isLoading, pricingDisplayMode } = usePricingData()

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Public ACU')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-[1500px] space-y-8 pb-8'>
          <section className='border-border overflow-hidden rounded-lg border bg-[linear-gradient(120deg,rgba(14,165,233,0.09),transparent_42%),linear-gradient(300deg,rgba(34,197,94,0.07),transparent_38%)]'>
            <div className='grid gap-6 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] lg:p-7'>
              <div className='min-w-0'>
                <Badge variant='outline' className='mb-4 gap-1.5'>
                  <Route className='size-3.5' />
                  {t('Automatic model and route selection')}
                </Badge>
                <h1 className='max-w-3xl text-2xl leading-tight font-semibold sm:text-3xl'>
                  {t('Match each task with a suitable model and route')}
                </h1>
                <p className='text-muted-foreground mt-3 max-w-3xl text-sm leading-6'>
                  {t(
                    'To use Public ACU, replace a specific model such as gpt-5.6-sol with acu-auto. For more quality-focused tasks, use acu-high instead. You can keep the same request method; Public ACU will select the model, route, and fallback automatically.'
                  )}
                </p>
                <div className='mt-5 flex flex-wrap gap-2'>
                  <Button render={<Link to='/keys' />}>
                    {t('Start using ACU')}
                    <ArrowRight />
                  </Button>
                  <Button
                    variant='outline'
                    render={
                      <Link
                        to='/usage-logs/$section'
                        params={{ section: 'timeline' }}
                      />
                    }
                  >
                    {t('View Route Timeline')}
                  </Button>
                </div>
              </div>
              <div className='grid gap-3 sm:grid-cols-2'>
                {ROUTING_FACTORS.map(({ key, icon: Icon }) => (
                  <div
                    key={key}
                    className='border-border/80 bg-background/75 flex min-h-24 flex-col justify-between rounded-md border p-4'
                  >
                    <Icon className='text-primary size-5' />
                    <div className='mt-4'>
                      <div className='text-sm font-medium'>
                        {t(`Public ACU factor ${key}`)}
                      </div>
                      <div className='text-muted-foreground mt-1 text-xs'>
                        {t(`Public ACU factor ${key} description`)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className='space-y-3'>
            <div>
              <h2 className='text-lg font-semibold'>
                {t('Choose a routing mode')}
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t(
                  'Both modes automatically select the model and route. The difference is their quality preference.'
                )}
              </p>
            </div>
            <div className='grid gap-3 md:grid-cols-2'>
              <article className='border-border bg-card rounded-md border p-5'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center gap-2'>
                    <Gauge className='size-5 text-cyan-600 dark:text-cyan-300' />
                    <h3 className='font-semibold'>acu-auto</h3>
                  </div>
                  <Badge>{t('Balanced')}</Badge>
                </div>
                <p className='text-muted-foreground mt-3 text-sm leading-6'>
                  {t(
                    'Recommended for everyday use. Replace a specific model such as gpt-5.6-sol with acu-auto, and Public ACU will balance expected quality, price, speed, and reliability for you.'
                  )}
                </p>
              </article>
              <article className='border-border bg-card rounded-md border p-5'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center gap-2'>
                    <Sparkles className='size-5 text-emerald-600 dark:text-emerald-300' />
                    <h3 className='font-semibold'>acu-high</h3>
                  </div>
                  <Badge variant='secondary'>{t('Quality preference')}</Badge>
                </div>
                <p className='text-muted-foreground mt-3 text-sm leading-6'>
                  {t(
                    'For important or complex tasks. Replace the model with acu-high to keep automatic model and route selection while preferring higher-quality results, usually with a higher cost or slower response.'
                  )}
                </p>
              </article>
            </div>
          </section>

          <section className='space-y-3'>
            <div>
              <h2 className='text-lg font-semibold'>
                {t('How difficulty, quality, and price connect')}
              </h2>
              <p className='text-muted-foreground mt-1 max-w-4xl text-sm leading-6'>
                {t(
                  'Harder tasks usually require more quality assurance. Explore the curves to compare estimated quality and execution price at different difficulty levels.'
                )}
              </p>
            </div>
            {isLoading ? (
              <Skeleton className='h-[620px] w-full rounded-lg' />
            ) : (
              <ACUModelCurves
                models={models}
                displayMode={pricingDisplayMode}
              />
            )}
          </section>

          <section className='space-y-4'>
            <div>
              <h2 className='text-lg font-semibold'>
                {t('How Public ACU routes')}
              </h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t(
                  'After a model is selected, Public ACU chooses a suitable line using price, speed, and historical success rate, then recovers through fallback when needed.'
                )}
              </p>
            </div>
            <ol className='grid gap-2 lg:grid-cols-5'>
              {[
                t('Understand task'),
                t('Estimate difficulty'),
                t('Select model'),
                t('Select route'),
                t('Fallback and return'),
              ].map((label, index) => (
                <li
                  key={label}
                  className='border-border bg-card flex min-h-20 items-center gap-3 rounded-md border p-3'
                >
                  <span className='bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                    {index + 1}
                  </span>
                  <span className='text-sm font-medium'>{label}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]'>
            <AcuQuickStart mode='preview' className='max-w-none' />
            <aside className='space-y-3'>
              <h2 className='text-lg font-semibold'>
                {t('Verify your setup')}
              </h2>
              <p className='text-muted-foreground text-sm leading-6'>
                {t(
                  'Use acu-auto or acu-high to enter Public ACU routing. Direct model calls remain traditional explicit calls and do not create Public ACU route traces.'
                )}
              </p>
              <Button
                className='w-full justify-between'
                variant='outline'
                render={<Link to='/playground' />}
              >
                {t('ACU Conversation')}
                <ArrowRight />
              </Button>
              <Button
                className='w-full justify-between'
                variant='outline'
                render={
                  <Link
                    to='/usage-logs/$section'
                    params={{ section: 'timeline' }}
                  />
                }
              >
                {t('Route Timeline')}
                <ArrowRight />
              </Button>
            </aside>
          </section>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

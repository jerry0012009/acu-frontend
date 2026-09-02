import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Film,
  Gauge,
  Image,
  ListChecks,
  MessageSquareText,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PrivateACUAdmin } from '@/features/dashboard/components/admin/private-acu-admin'
import { PrivateACUFilmPOC } from '@/features/dashboard/components/admin/private-acu-film-poc'
import { PrivateACULearningRuns } from '@/features/dashboard/components/admin/private-acu-learning-runs'
import { PrivateACUSkillCatalog } from '@/features/dashboard/components/admin/private-acu-skill-catalog'
import { getPrivateACUFilmStatus } from '@/features/dashboard/private-acu-admin-api'
import { getPrivateACUFilmForUser } from '@/features/dashboard/private-acu-user-api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export type PrivateACUSection =
  | 'overview'
  | 'account'
  | 'film'
  | 'learning-runs'
  | 'prompts'

type LearningFlowStep = {
  label: string
  title: string
  description: string
  icon: LucideIcon
}

function WorkspaceCard(props: {
  title: string
  description: string
  icon: typeof BookOpen
  to: string
  value?: string
}) {
  return (
    <div className='border-border bg-card flex min-w-0 flex-col justify-between gap-4 rounded-lg border p-4 shadow-xs'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 className='font-semibold'>{props.title}</h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            {props.description}
          </p>
        </div>
        <props.icon className='text-muted-foreground size-5 shrink-0' />
      </div>
      <div className='flex items-center justify-between gap-3'>
        {props.value ? (
          <Badge variant='secondary'>{props.value}</Badge>
        ) : (
          <span />
        )}
        <Button variant='ghost' size='sm' render={<Link to={props.to} />}>
          {useTranslation().t('Open')}
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function LearningFlowLane(props: {
  title: string
  description: string
  icon: LucideIcon
  tone: 'account' | 'film'
  steps: LearningFlowStep[]
}) {
  const toneClass =
    props.tone === 'account'
      ? {
          icon: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
          line: 'text-cyan-500',
          marker: 'bg-cyan-500 text-white',
        }
      : {
          icon: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
          line: 'text-amber-500',
          marker: 'bg-amber-500 text-white',
        }

  return (
    <section className='border-border overflow-hidden rounded-lg border'>
      <header className='bg-muted/20 border-border border-b p-4'>
        <div className='flex items-start gap-3'>
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-md ${toneClass.icon}`}
          >
            <props.icon className='size-4' aria-hidden='true' />
          </div>
          <div className='min-w-0'>
            <h4 className='font-semibold'>{props.title}</h4>
            <p className='text-muted-foreground mt-1 text-sm'>
              {props.description}
            </p>
          </div>
        </div>
      </header>
      <ol className='divide-border divide-y'>
        {props.steps.map((step, index) => (
          <li key={step.label} className='relative flex gap-3 p-4'>
            <div
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${toneClass.marker}`}
            >
              {index + 1}
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <step.icon
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
                <span className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                  {step.label}
                </span>
              </div>
              <h5 className='mt-1 text-sm font-semibold'>{step.title}</h5>
              <p className='text-muted-foreground mt-1 text-sm leading-5'>
                {step.description}
              </p>
            </div>
            {index < props.steps.length - 1 && (
              <ArrowDown
                className={`bg-background absolute bottom-0 left-[1.1rem] size-3 translate-y-1/2 ${toneClass.line}`}
                aria-hidden='true'
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function SharedLearningBackbone() {
  const { t } = useTranslation()
  const stages = [
    [t('Input'), '01'],
    [t('Evidence'), '02'],
    [t('Experience'), '03'],
    [t('Learning'), '04'],
    [t('Quality Skill'), '05'],
  ]

  return (
    <div className='overflow-x-auto'>
      <div className='grid min-w-[760px] grid-cols-5 gap-2'>
        {stages.map(([label, number], index) => (
          <div key={label} className='flex items-center gap-2'>
            <div className='bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'>
              {number}
            </div>
            <span className='text-sm font-medium'>{label}</span>
            {index < stages.length - 1 && (
              <ArrowRight
                className='text-muted-foreground ml-auto size-4'
                aria-hidden='true'
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function OverviewPage(props: { isAdmin: boolean }) {
  const { t } = useTranslation()
  const adminFilmQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'film'],
    queryFn: getPrivateACUFilmStatus,
    enabled: props.isAdmin,
  })
  const memberFilmQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'member-film'],
    queryFn: getPrivateACUFilmForUser,
    enabled: !props.isAdmin,
    retry: false,
  })
  const filmSkills = props.isAdmin
    ? (adminFilmQuery.data?.skills ?? [])
    : (memberFilmQuery.data?.spaces.flatMap((space) => space.skills) ?? [])
  const filmIsError = props.isAdmin
    ? adminFilmQuery.isError
    : memberFilmQuery.isError
  const accountFlow: LearningFlowStep[] = [
    {
      label: t('Input'),
      title: t('LLM request context'),
      description: t(
        'A new Agent request and the latest human User Message enter Private ACU.'
      ),
      icon: MessageSquareText,
    },
    {
      label: t('Evidence'),
      title: t('User dissatisfaction'),
      description: t(
        'Learning Judge identifies whether the user is dissatisfied with the prior result.'
      ),
      icon: BrainCircuit,
    },
    {
      label: t('Experience'),
      title: t('Account learning experience'),
      description: t(
        'The relevant Agent Context is recorded as an account-scoped learning experience.'
      ),
      icon: Workflow,
    },
    {
      label: t('Learning'),
      title: t('Acontext distillation'),
      description: t(
        'Acontext asynchronously extracts or updates reusable preference knowledge.'
      ),
      icon: Sparkles,
    },
    {
      label: t('Quality Skill'),
      title: t('Reusable account preference'),
      description: t(
        'The resulting Skill becomes part of the account memory for later work.'
      ),
      icon: BookOpen,
    },
  ]
  const filmFlow: LearningFlowStep[] = [
    {
      label: t('Input'),
      title: t('Curated image and text'),
      description: t(
        'The team submits one visual sample with its scene context and analysis.'
      ),
      icon: Image,
    },
    {
      label: t('Evidence'),
      title: t('Visual-language judgment'),
      description: t(
        'The team marks what works, what is missing, and the reason for acceptance or rejection.'
      ),
      icon: Film,
    },
    {
      label: t('Experience'),
      title: t('Film selection experience'),
      description: t(
        'The image, text, context, structured analysis, and judgment form one learning unit.'
      ),
      icon: Workflow,
    },
    {
      label: t('Learning'),
      title: t('Film learning adapter'),
      description: t(
        'The adapter sends the experience to the shared Acontext learning service.'
      ),
      icon: Sparkles,
    },
    {
      label: t('Quality Skill'),
      title: t('GYZ visual-language Skill'),
      description: t(
        'Acontext produces a conditional Quality Skill for future image-generation work.'
      ),
      icon: Film,
    },
  ]

  return (
    <div className='space-y-8'>
      <header className='border-border flex flex-wrap items-start justify-between gap-4 border-b pb-5'>
        <div className='max-w-3xl'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase'>
            <Workflow className='size-4' aria-hidden='true' />
            {t('Private ACU')}
          </div>
          <h3 className='mt-2 text-xl font-semibold tracking-tight'>
            {t('Learning system')}
          </h3>
          <p className='text-muted-foreground mt-2 text-sm leading-6'>
            {t(
              'Private ACU turns interaction feedback and curated visual evidence into reusable Quality Skills through one shared learning backbone.'
            )}
          </p>
        </div>
        <Badge variant='secondary' className='shrink-0'>
          {t('Two learning paths')}
        </Badge>
      </header>

      <section
        className='space-y-4'
        aria-labelledby='private-acu-learning-flow'
      >
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h3
              id='private-acu-learning-flow'
              className='text-base font-semibold'
            >
              {t('Unified learning flow')}
            </h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Both paths follow the same sequence while keeping their evidence sources distinct.'
              )}
            </p>
          </div>
          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <span className='size-2 rounded-full bg-cyan-500' />
            {t('Account')}
            <span className='ml-2 size-2 rounded-full bg-amber-500' />
            {t('Film POC')}
          </div>
        </div>
        <div className='border-border bg-muted/10 rounded-lg border p-4'>
          <SharedLearningBackbone />
        </div>
        <div className='grid gap-4 lg:grid-cols-2'>
          <LearningFlowLane
            title={t('LLM call learning')}
            description={t(
              'Improve account-level preferences from real Agent interactions.'
            )}
            icon={BrainCircuit}
            tone='account'
            steps={accountFlow}
          />
          <LearningFlowLane
            title={t('Film POC learning')}
            description={t(
              'Build the GYZ visual-language standard from team-selected material.'
            )}
            icon={Film}
            tone='film'
            steps={filmFlow}
          />
        </div>
      </section>

      <section className='space-y-4'>
        <div>
          <h3 className='text-base font-semibold'>
            {t('Private ACU workspace')}
          </h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t(
              'Inspect inputs, learning runs, Skills, and prompt configuration.'
            )}
          </p>
        </div>
        <div className='grid gap-3 md:grid-cols-2'>
          <WorkspaceCard
            title={t('Account learning')}
            description={t(
              'Review account-level memory, experiences, and learning history.'
            )}
            icon={BookOpen}
            to='/private-acu/account'
          />
          <WorkspaceCard
            title={t('Film POC')}
            description={t(
              'Review the team visual-language learning space and Quality Skills.'
            )}
            icon={Film}
            to='/private-acu/film'
            value={
              filmIsError
                ? t('No access')
                : `${filmSkills.length} ${t('skills')}`
            }
          />
          <WorkspaceCard
            title={t('Learning runs')}
            description={t(
              'Inspect the recorded inputs, intermediate results, and Skill changes.'
            )}
            icon={ListChecks}
            to='/private-acu/learning-runs'
          />
          {props.isAdmin && (
            <WorkspaceCard
              title={t('Prompts')}
              description={t(
                'Manage the shared Private ACU prompts and inspect prompt status.'
              )}
              icon={Gauge}
              to='/private-acu/prompts'
            />
          )}
        </div>
      </section>
    </div>
  )
}

function MemberFilmPage() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['private-acu', 'film', 'member'],
    queryFn: getPrivateACUFilmForUser,
  })
  if (query.isLoading) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (query.isError || !query.data) {
    return (
      <div className='border-border bg-muted/20 rounded-lg border p-5'>
        <h3 className='font-semibold'>{t('Film POC access unavailable')}</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('Ask an administrator to bind your account to a POC space.')}
        </p>
      </div>
    )
  }
  return (
    <div className='space-y-5'>
      {query.data.spaces.map((space) => (
        <section key={space.key} className='space-y-3'>
          <div>
            <h3 className='text-base font-semibold'>{space.key}</h3>
            <p className='text-muted-foreground text-sm'>
              {space.teamScope || t('Film learning space')}
            </p>
          </div>
          <PrivateACUSkillCatalog skills={space.skills} />
        </section>
      ))}
    </div>
  )
}

export function PrivateACUWorkspace(props: {
  section: PrivateACUSection
  learningKind?: string
}) {
  const { t } = useTranslation()
  const role = useAuthStore((state) => state.auth.user?.role ?? ROLE.GUEST)
  const isAdmin = role >= ROLE.ADMIN
  const titleBySection: Record<PrivateACUSection, string> = {
    overview: t('Private ACU'),
    account: t('Account learning'),
    film: t('Film POC'),
    'learning-runs': t('Learning runs'),
    prompts: t('Prompts'),
  }

  let content: React.ReactNode
  if (props.section === 'overview') {
    content = <OverviewPage isAdmin={isAdmin} />
  } else if (props.section === 'account') {
    content = isAdmin ? <PrivateACUAdmin view='account' /> : <MemberFilmPage />
  } else if (props.section === 'film') {
    content = isAdmin ? <PrivateACUFilmPOC /> : <MemberFilmPage />
  } else if (props.section === 'learning-runs') {
    content = isAdmin ? (
      <PrivateACULearningRuns learningKind={props.learningKind} />
    ) : (
      <MemberFilmPage />
    )
  } else {
    content = isAdmin ? <PrivateACUAdmin view='prompts' /> : <MemberFilmPage />
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {titleBySection[props.section]}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-7xl'>{content}</div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

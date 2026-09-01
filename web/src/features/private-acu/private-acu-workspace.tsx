import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen, Film, Gauge, ListChecks } from 'lucide-react'
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

  return (
    <div className='space-y-5'>
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
            filmIsError ? t('No access') : `${filmSkills.length} ${t('skills')}`
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
      <section className='border-border bg-muted/20 rounded-lg border p-4'>
        <h3 className='font-semibold'>{t('Learning flow')}</h3>
        <div className='text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-sm'>
          <Badge variant='outline'>{t('Evidence')}</Badge>
          <ArrowRight className='size-4' />
          <Badge variant='outline'>{t('Experience')}</Badge>
          <ArrowRight className='size-4' />
          <Badge variant='outline'>{t('Learning')}</Badge>
          <ArrowRight className='size-4' />
          <Badge variant='outline'>{t('Quality Skill')}</Badge>
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

export function PrivateACUWorkspace(props: { section: PrivateACUSection }) {
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
    content = isAdmin ? <PrivateACULearningRuns /> : <MemberFilmPage />
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

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronDown, KeyRound, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { getApiKeys } from '@/features/keys/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  useApiInfo,
  useAnnouncements,
  useFAQ,
  useDashboardContentVisibility,
} from '../../hooks/use-status-data'
import { AnnouncementsPanel } from './announcements-panel'
import { ApiInfoPanel } from './api-info-panel'
import { FAQPanel } from './faq-panel'
import { PerformanceHealthPanel } from './performance-health-panel'
import { SummaryCards } from './summary-cards'
import { UptimePanel } from './uptime-panel'

export function OverviewDashboard() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const visibility = useDashboardContentVisibility()
  const apiInfo = useApiInfo()
  const announcements = useAnnouncements()
  const faq = useFAQ()
  const isAdmin = Number(user?.role) >= ROLE.ADMIN
  const keys = useQuery({
    queryKey: ['dashboard', 'overview', 'api-keys', user?.id],
    queryFn: async () => {
      const result = await getApiKeys({ p: 1, size: 100 })
      if (!result.success) throw new Error('keys unavailable')
      return result.data?.items ?? []
    },
    staleTime: 60 * 1000,
    retry: false,
  })
  const hasKey = keys.data?.some(
    (key) =>
      key.status === 1 &&
      (key.expired_time <= 0 || key.expired_time > Date.now() / 1000) &&
      (key.unlimited_quota || key.remain_quota > 0)
  )
  const isNewAccount = Number(user?.request_count ?? 0) === 0
  const needsCredits = Number(user?.quota ?? 0) <= 0

  return (
    <div className='acu-overview space-y-7'>
      {(isNewAccount || needsCredits || (keys.isSuccess && !hasKey)) && (
        <section
          className='flex flex-wrap items-center justify-between gap-3 border-b pb-4'
          aria-label={t('Recommended actions')}
        >
          <div className='min-w-0'>
            <h3 className='text-sm font-medium'>
              {isNewAccount
                ? t('Your first connection starts here')
                : t('Account needs attention')}
            </h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {needsCredits
                ? t(
                    'Add funds before making paid requests. Your connection details are ready when you are.'
                  )
                : t(
                    'Connect your preferred app, or use your API key directly.'
                  )}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {isNewAccount && (
              <Button size='sm' render={<Link to='/' hash='start' />}>
                {t('Connect my tools')}
                <ArrowRight data-icon='inline-end' />
              </Button>
            )}
            {needsCredits && (
              <Button
                size='sm'
                variant='outline'
                render={<Link to='/wallet' />}
              >
                {t('Add credits')}
              </Button>
            )}
            {keys.isSuccess && !hasKey && !isNewAccount && (
              <Button size='sm' variant='outline' render={<Link to='/keys' />}>
                {t('Create or enable an API key')}
              </Button>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby='account-usage-title'>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
          <h3 id='account-usage-title' className='text-base font-semibold'>
            {t('Usage at a glance')}
          </h3>
          <div className='flex items-center gap-1'>
            <Button variant='ghost' size='sm' render={<Link to='/keys' />}>
              <KeyRound data-icon='inline-start' />
              {t('API Keys')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              render={<Link to='/usage-logs' />}
            >
              <FileText data-icon='inline-start' />
              {t('Call Records')}
            </Button>
          </div>
        </div>
        <SummaryCards />
      </section>

      {isAdmin && <PerformanceHealthPanel />}
      {visibility.uptimeKuma && <UptimePanel />}

      {(apiInfo.items.length > 0 ||
        announcements.items.length > 0 ||
        faq.items.length > 0) && (
        <section
          className='border-t pt-5'
          aria-label={t('Resources and updates')}
        >
          <h3 className='mb-1 text-base font-semibold'>
            {t('Resources and updates')}
          </h3>
          {[
            {
              title: t('API Info'),
              visible: visibility.apiInfo && apiInfo.items.length > 0,
              content: <ApiInfoPanel />,
            },
            {
              title: t('Announcements'),
              visible:
                visibility.announcements && announcements.items.length > 0,
              content: <AnnouncementsPanel />,
            },
            {
              title: t('FAQ'),
              visible: visibility.faq && faq.items.length > 0,
              content: <FAQPanel />,
            },
          ]
            .filter((item) => item.visible)
            .map((item) => (
              <details key={item.title} className='group border-b'>
                <summary className='flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium [&::-webkit-details-marker]:hidden'>
                  {item.title}
                  <ChevronDown
                    className='text-muted-foreground size-4 transition-transform group-open:rotate-180'
                    aria-hidden='true'
                  />
                </summary>
                <div className='pb-4'>{item.content}</div>
              </details>
            ))}
        </section>
      )}
    </div>
  )
}

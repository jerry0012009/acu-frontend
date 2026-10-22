import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import {
  classifyHistoryBucket,
  classifyProbeBucket,
  probeBucketTitle,
  type ACUChannelOverview,
} from './acu-channel-health-model'
import { StatusTimeline } from './acu-health-timeline'
import {
  monitorStateLabel,
  protocolLabel,
  protocolShortLabel,
} from './acu-monitor-presentation'
import {
  ACUMonitorProfile,
  type ACUMonitorProfileActions,
} from './acu-monitor-profile'

const stateVariant = {
  healthy: 'success',
  degraded: 'warning',
  cooldown: 'warning',
  unavailable: 'danger',
  disabled: 'neutral',
} as const

export function ACUChannelHealthCard(
  props: ACUMonitorProfileActions & {
    channel: ACUChannelOverview
    generatedAt: string
  }
) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  return (
    <section
      className={cn(
        'bg-background min-w-0 self-start overflow-hidden rounded-lg border [contain-intrinsic-size:auto_420px] [content-visibility:auto]',
        expanded && 'xl:col-span-2'
      )}
    >
      <button
        type='button'
        className='w-full min-w-0 p-3 text-left sm:p-4'
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          {expanded ? (
            <ChevronDown className='size-4 shrink-0' />
          ) : (
            <ChevronRight className='size-4 shrink-0' />
          )}
          <h3 className='min-w-0 text-sm font-semibold break-all'>
            {props.channel.channel}
          </h3>
          <StatusBadge
            label={monitorStateLabel(props.channel.state, t)}
            variant={stateVariant[props.channel.state]}
            copyable={false}
          />
        </div>
        <div className='mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs'>
          {props.channel.providers.map((provider) => (
            <Badge key={provider} variant='outline'>
              {provider}
            </Badge>
          ))}
          <span>
            {props.channel.eligibleProfileCount}/
            {props.channel.enabledProfileCount} {t('Profiles available')}
          </span>
          {[
            ...new Set(
              props.channel.profiles.flatMap((profile) => profile.protocol)
            ),
          ].map((protocol) => (
            <Badge
              key={protocol}
              variant='outline'
              title={protocolLabel(protocol, t)}
            >
              {protocolShortLabel(protocol, t)}
            </Badge>
          ))}
        </div>
      </button>
      <div className='grid gap-3 border-y p-3 text-xs sm:grid-cols-3 sm:px-4'>
        <div>
          <div className='text-muted-foreground'>
            {t('Production')} · {t('current range')}
          </div>
          <div className='mt-1 font-medium'>
            {props.channel.availability === null
              ? t('No production traffic')
              : `${props.channel.successCount} / ${props.channel.requestCount} ${t('successful attempts')} · ${(props.channel.availability * 100).toFixed(2)}%`}
          </div>
        </div>
        <div>
          <div className='text-muted-foreground'>{t('Probe coverage')}</div>
          <div className='mt-1 font-medium'>
            {props.channel.probeCount === 0
              ? t('Not actively verified')
              : `${props.channel.probedProfileCount} / ${props.channel.enabledProfileCount} ${t('Profiles passed')}`}
          </div>
          <div className='text-muted-foreground mt-1'>
            {t('Targeted')} {props.channel.targetedProbeSuccessCount} /{' '}
            {props.channel.targetedProbeCount}
          </div>
          {props.channel.latestFullPoolProbeAt && (
            <div className='text-muted-foreground mt-1'>
              {t('Full pool')}:{' '}
              {new Date(props.channel.latestFullPoolProbeAt).toLocaleString()}
            </div>
          )}
        </div>
        <div>
          <div className='text-muted-foreground'>{t('Primary Profile')}</div>
          <div className='mt-1 font-medium break-all'>
            {props.channel.primaryProfile?.canonicalModel ??
              t('No routing score')}
          </div>
        </div>
      </div>
      <div className='bg-muted/10 space-y-2 p-3 sm:px-4'>
        <StatusTimeline
          label={t('Production')}
          buckets={props.channel.buckets.map((bucket) => ({
            key: bucket.bucket,
            tone: classifyHistoryBucket(bucket),
            title: `${new Date(bucket.bucket).toLocaleString()} · ${bucket.success_count}/${bucket.request_count}`,
          }))}
        />
        <StatusTimeline
          label={t('Probe')}
          buckets={props.channel.probeBuckets.map((bucket) => ({
            key: bucket.bucket,
            tone: classifyProbeBucket(bucket),
            title: probeBucketTitle(bucket),
          }))}
        />
        <div className='text-muted-foreground flex flex-wrap justify-between gap-2 text-xs'>
          <span>
            {props.channel.modelCount} {t('models')}
          </span>
          <span>
            {t('Latest health event')}:{' '}
            {props.channel.latestHealthEvent
              ? `${t(props.channel.latestHealthEvent.source)} ${monitorStateLabel(props.channel.latestHealthEvent.result, t)}`
              : t('none')}
          </span>
          {props.generatedAt && (
            <time dateTime={props.generatedAt}>
              {new Date(props.generatedAt).toLocaleString()}
            </time>
          )}
        </div>
      </div>
      {expanded && (
        <div className='border-t'>
          {props.tokenProfileActions && (
            <div className='bg-muted/20 px-4 py-2 text-xs break-words'>
              {t('This API key')}: {props.tokenProfileActions.tokenName}
            </div>
          )}
          {props.channel.profiles.map((profile) => (
            <ACUMonitorProfile
              {...props}
              key={`${props.tokenProfileActions?.scope?.tokenId ?? ''}:${profile.executionProfileId}`}
              profile={profile}
              showModel
              showDiagnostics
            />
          ))}
        </div>
      )}
    </section>
  )
}

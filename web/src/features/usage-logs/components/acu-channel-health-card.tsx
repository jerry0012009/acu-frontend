import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { ACUChannelMonitorProfile } from '../api'
import {
  classifyHistoryBucket,
  classifyProbeBucket,
  type ACUChannelOverview,
} from './acu-channel-health-model'
import {
  monitorReason,
  monitorStateLabel,
  protocolLabel,
} from './acu-monitor-presentation'

function milliseconds(value?: number | null) {
  if (!value) return 'n/a'
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`
}

function relativeTime(value: string | null | undefined, language: string) {
  if (!value) return 'n/a'
  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000)
  )
  const locale = language.replace('_', '-').replace(/^zhCN$/i, 'zh-CN')
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (elapsedSeconds < 60) return formatter.format(0, 'minute')
  if (elapsedSeconds < 3600) {
    return formatter.format(-Math.floor(elapsedSeconds / 60), 'minute')
  }
  if (elapsedSeconds < 86400) {
    return formatter.format(-Math.floor(elapsedSeconds / 3600), 'hour')
  }
  return formatter.format(-Math.floor(elapsedSeconds / 86400), 'day')
}

const stateVariant = {
  healthy: 'success',
  degraded: 'warning',
  cooldown: 'warning',
  unavailable: 'danger',
  disabled: 'neutral',
} as const

const bucketTone = {
  empty: 'bg-muted',
  success: 'bg-success',
  mixed: 'bg-warning',
  failed: 'bg-destructive',
} as const

export function ACUChannelHealthCard(props: {
  channel: ACUChannelOverview
  generatedAt: string
}) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const primary = props.channel.primaryProfile
  return (
    <section className='bg-background min-w-0 rounded-md border'>
      <button
        type='button'
        className='flex w-full min-w-0 items-start justify-between gap-3 p-4 text-left'
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <div className='min-w-0'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            {expanded ? (
              <ChevronDown className='size-4 shrink-0' aria-hidden='true' />
            ) : (
              <ChevronRight className='size-4 shrink-0' aria-hidden='true' />
            )}
            <h3 className='text-sm font-semibold break-all'>
              {props.channel.channel}
            </h3>
            <StatusBadge
              label={monitorStateLabel(props.channel.state, t)}
              variant={stateVariant[props.channel.state]}
              copyable={false}
            />
          </div>
          <div className='mt-2 flex flex-wrap items-center gap-2 pl-6'>
            {props.channel.providers.map((provider) => (
              <Badge key={provider} variant='outline'>
                {provider}
              </Badge>
            ))}
            <span className='text-muted-foreground text-xs'>
              {props.channel.eligibleProfileCount} /{' '}
              {props.channel.enabledProfileCount} {t('Profiles available')}
            </span>
            {[
              ...new Set(
                props.channel.profiles.flatMap((profile) => profile.protocol)
              ),
            ].map((value) => (
              <Badge key={value} variant='outline'>
                {protocolLabel(value, t)}
              </Badge>
            ))}
          </div>
        </div>
      </button>

      <div className='bg-border grid gap-px border-y sm:grid-cols-3'>
        <div className='bg-background min-w-0 space-y-1 p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Production')} · {t('current range')}
          </div>
          {props.channel.availability === null ? (
            <div className='text-sm font-medium'>
              {t('No production traffic')}
            </div>
          ) : (
            <>
              <div className='text-sm font-semibold'>
                {props.channel.successCount} / {props.channel.requestCount}{' '}
                {t('successful attempts')}
              </div>
              <div className='text-xs'>
                {(props.channel.availability * 100).toFixed(2)}%
              </div>
            </>
          )}
          <div className='text-muted-foreground text-xs'>
            P50 {milliseconds(primary?.p50FirstModelEventLatencyMs)} · P95{' '}
            {milliseconds(primary?.p95FirstModelEventLatencyMs)}
          </div>
        </div>
        <div className='bg-background min-w-0 space-y-1 p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Probe coverage')}
          </div>
          {props.channel.probeCount === 0 ? (
            <div className='text-sm font-medium'>
              {t('Not actively verified')}
            </div>
          ) : (
            <div className='text-sm font-semibold'>
              {props.channel.probedProfileCount} /{' '}
              {props.channel.enabledProfileCount} {t('Profiles passed')}
            </div>
          )}
          <div className='text-muted-foreground text-xs'>
            {t('Full pool')}{' '}
            {relativeTime(props.channel.latestFullPoolProbeAt, i18n.language)}
          </div>
          <div className='text-muted-foreground text-xs'>
            {t('Recovery')} {props.channel.recoveryProbeSuccessCount} /{' '}
            {props.channel.recoveryProbeCount}
          </div>
        </div>
        <div className='bg-background min-w-0 space-y-1 p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Primary Profile')}
          </div>
          <div className='truncate text-sm font-semibold'>
            {primary?.canonicalModel ?? t('No routing score')}
          </div>
          <div className='text-muted-foreground text-xs'>
            {primary?.profileRank == null
              ? t('Not scored')
              : `#${primary.profileRank} / ${primary.profileCandidateCount} · ${primary.multiplier ?? 0}x`}
          </div>
        </div>
      </div>

      <div className='space-y-3 p-4'>
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
            title: `${new Date(bucket.bucket).toLocaleString()} · full-pool ${bucket.fullPoolCount} · recovery ${bucket.recoveryCount} · ${bucket.successCount}/${bucket.totalCount}`,
          }))}
        />
        <div className='text-muted-foreground flex flex-wrap justify-between gap-2 text-xs'>
          <span>
            {props.channel.modelCount} {t('models')}
          </span>
          <span>
            {t('Latest health event')}:{' '}
            {props.channel.latestHealthEvent
              ? `${t(props.channel.latestHealthEvent.source)} ${monitorStateLabel(props.channel.latestHealthEvent.result, t)} · ${relativeTime(props.channel.latestHealthEvent.at, i18n.language)}`
              : t('none')}
          </span>
          <span>{relativeTime(props.generatedAt, i18n.language)}</span>
        </div>
      </div>

      {expanded && (
        <div className='space-y-2 border-t p-3'>
          {props.channel.profiles.map((profile) => (
            <ChannelProfile
              key={profile.executionProfileId}
              profile={profile}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function StatusTimeline(props: {
  label: string
  buckets: Array<{
    key: string
    tone: keyof typeof bucketTone
    title: string
  }>
}) {
  return (
    <div className='grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div
        className='flex h-4 min-w-0 gap-0.5'
        aria-label={`${props.label} timeline`}
      >
        {props.buckets.map((bucket) => (
          <span
            key={bucket.key}
            className={cn(
              'min-w-0 flex-1 rounded-[1px]',
              bucketTone[bucket.tone]
            )}
            title={bucket.title}
          />
        ))}
      </div>
    </div>
  )
}

function ChannelProfile(props: { profile: ACUChannelMonitorProfile }) {
  const { t, i18n } = useTranslation()
  const profile = props.profile
  return (
    <details className='rounded border p-3 text-xs'>
      <summary className='cursor-pointer list-none'>
        <div className='flex min-w-0 flex-wrap items-center justify-between gap-2'>
          <div className='min-w-0'>
            <div className='font-medium'>{profile.canonicalModel}</div>
            <div className='text-muted-foreground font-mono text-[11px] break-all'>
              {profile.executionProfileId}
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <StatusBadge
              label={monitorStateLabel(
                profile.routingEligible ? 'eligible' : profile.state,
                t
              )}
              variant={
                stateVariant[
                  profile.routingEligible ? 'healthy' : 'unavailable'
                ]
              }
              copyable={false}
            />
            <span className='font-medium'>
              {profile.profileUtility === null
                ? t('Not scored')
                : `${profile.profileUtility.toFixed(3)} · #${profile.profileRank}/${profile.profileCandidateCount}`}
            </span>
          </div>
        </div>
      </summary>
      <div className='mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4'>
        <ProfileField
          label={t('Protocol')}
          value={profile.protocol
            .map((value) => protocolLabel(value, t))
            .join(', ')}
        />
        <ProfileField
          label={t('Eligibility')}
          value={`${profile.routingEligibility} · ${profile.blockingScope || 'none'} · ${profile.statusReason || 'n/a'}`}
        />
        <ProfileField
          label={t('Multiplier')}
          value={String(profile.multiplier || 'n/a')}
        />
        <ProfileField
          label={t('Production Attempts')}
          value={`${profile.successCount}/${profile.requestCount}`}
        />
        <ProfileField
          label={t('Judge Attempts')}
          value={`${profile.judgeSuccessCount}/${profile.judgeAttemptCount}`}
        />
        <ProfileField
          label={t('Full-pool Probes')}
          value={`${profile.fullPoolProbeSuccessCount}/${profile.fullPoolProbeCount}`}
        />
        <ProfileField
          label={t('Recovery Probes')}
          value={`${profile.recoveryProbeSuccessCount}/${profile.recoveryProbeCount}`}
        />
        <ProfileField
          label={t('p50 / p95')}
          value={`${milliseconds(profile.p50FirstModelEventLatencyMs)} / ${milliseconds(profile.p95FirstModelEventLatencyMs)}`}
        />
        <ProfileField
          label={t('Latest Probe')}
          value={`${profile.probeStatus || 'never'} · ${milliseconds(profile.probeLatencyMs)} · ${relativeTime(profile.lastProbeAt, i18n.language)}`}
        />
        <ProfileField
          label={t('Contributions')}
          value={
            profile.profileUtility === null
              ? 'n/a'
              : `cost ${profile.costContribution?.toFixed(3)} · speed ${profile.speedContribution?.toFixed(3)} · reliability ${profile.reliabilityContribution?.toFixed(3)}`
          }
        />
        <ProfileField
          label={t('Metric source')}
          value={`${profile.metricSource || 'n/a'} · ${profile.firstEventSampleCount} first-event`}
        />
        <ProfileField
          label={t('Last error')}
          value={`${monitorReason(profile.lastError || profile.statusReason, t).title} · ${monitorReason(profile.lastError || profile.statusReason, t).code}`}
        />
        <ProfileField
          label={t('Cooldown')}
          value={
            profile.cooldownUntil
              ? new Date(profile.cooldownUntil).toLocaleString()
              : 'none'
          }
        />
      </div>
    </details>
  )
}

function ProfileField(props: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div className='mt-0.5 break-words'>{props.value}</div>
    </div>
  )
}

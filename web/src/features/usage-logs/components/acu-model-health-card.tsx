import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { ACUChannelMonitorProfile, ACUGlobalRoutingPolicy } from '../api'
import {
  anonymousACULineId,
  classifyHistoryBucket,
  classifyModelProbeBucket,
  classifyProbeBucket,
  formatProbeResult,
  probeBucketTitle,
  type ACUModelOverview,
} from './acu-channel-health-model'
import {
  canEnableProfileForGlobalRouting,
  isProfileGloballyAllowed,
} from './acu-global-routing-policy'
import { StatusTimeline } from './acu-health-timeline'
import { monitorStateLabel, protocolLabel } from './acu-monitor-presentation'

const stateVariant = {
  healthy: 'success',
  degraded: 'warning',
  cooldown: 'warning',
  unavailable: 'danger',
  disabled: 'neutral',
} as const

function milliseconds(value?: number | null) {
  if (!value) return 'n/a'
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`
}

export function ACUModelHealthCard(props: {
  model: ACUModelOverview
  showDiagnostics?: boolean
  profileActions?: {
    policy?: ACUGlobalRoutingPolicy
    isTogglePending: (profileId: string) => boolean
    isProbePending: (profileId: string) => boolean
    onToggleRouting: (
      profile: ACUChannelMonitorProfile,
      enabled: boolean
    ) => void
    onProbe: (profile: ACUChannelMonitorProfile, protocol: string) => void
  }
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
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
              {props.model.modelId}
            </h3>
            <Badge variant='outline'>
              {props.model.eligibleCount}/{props.model.totalCount}{' '}
              {t('available lines')}
            </Badge>
          </div>
          <div className='text-muted-foreground mt-2 pl-6 text-xs'>
            {props.model.totalCount} {t('lines')}
          </div>
        </div>
      </button>
      <div className='space-y-3 border-t p-4'>
        <StatusTimeline
          label={t('Production')}
          buckets={props.model.buckets.map((bucket) => ({
            key: bucket.bucket,
            tone: classifyHistoryBucket(bucket),
            title: `${new Date(bucket.bucket).toLocaleString()} · ${bucket.success_count}/${bucket.request_count}`,
          }))}
        />
        <StatusTimeline
          label={t('Probe')}
          buckets={props.model.probeBuckets.map((bucket) => ({
            key: bucket.bucket,
            tone: classifyModelProbeBucket(bucket),
            title: probeBucketTitle(bucket),
          }))}
        />
        <div className='text-muted-foreground text-xs'>
          {props.model.availability === null
            ? t('No production traffic')
            : `${props.model.successCount}/${props.model.requestCount} · ${(props.model.availability * 100).toFixed(2)}%`}
        </div>
      </div>
      {expanded && (
        <div className='space-y-2 border-t p-3'>
          {props.model.profiles.map((profile, index) => (
            <ModelProfile
              key={profile.executionProfileId}
              index={index + 1}
              profile={profile}
              showDiagnostics={props.showDiagnostics}
              actions={props.profileActions}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ModelProfile(props: {
  index: number
  profile: ACUChannelMonitorProfile
  showDiagnostics?: boolean
  actions?: {
    policy?: ACUGlobalRoutingPolicy
    isTogglePending: (profileId: string) => boolean
    isProbePending: (profileId: string) => boolean
    onToggleRouting: (
      profile: ACUChannelMonitorProfile,
      enabled: boolean
    ) => void
    onProbe: (profile: ACUChannelMonitorProfile, protocol: string) => void
  }
}) {
  const { t } = useTranslation()
  const profile = props.profile
  const policy = props.actions?.policy
  const globallyAllowed =
    policy && isProfileGloballyAllowed(policy, profile.executionProfileId)
  const modelBlocked =
    policy && !canEnableProfileForGlobalRouting(policy, profile.canonicalModel)
  const firstProtocol = profile.protocol[0]
  const togglePending =
    props.actions?.isTogglePending(profile.executionProfileId) ?? false
  const probePending =
    props.actions?.isProbePending(profile.executionProfileId) ?? false
  return (
    <div className='rounded border p-3 text-xs'>
      <div className='flex min-w-0 flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <div className='font-medium'>
            #{props.index} {t('ACU Route')}{' '}
            {anonymousACULineId(profile.executionProfileId)}
          </div>
          {props.showDiagnostics ? (
            <div className='text-muted-foreground mt-1 font-mono text-[11px] break-all'>
              {profile.provider} · {profile.channel} ·{' '}
              {profile.executionProfileId}
            </div>
          ) : null}
        </div>
        <StatusBadge
          label={monitorStateLabel(
            profile.routingEligible ? 'eligible' : profile.state,
            t
          )}
          variant={
            stateVariant[profile.routingEligible ? 'healthy' : 'unavailable']
          }
          copyable={false}
        />
      </div>
      <div className='mt-3 grid gap-2 sm:grid-cols-3'>
        <ProfileMetric
          label={t('Multiplier')}
          value={`${profile.multiplier}x`}
        />
        <ProfileMetric
          label={t('P50 first event')}
          value={milliseconds(profile.p50FirstModelEventLatencyMs)}
        />
        <ProfileMetric
          label={t('Production')}
          value={
            profile.requestCount > 0
              ? `${((profile.successCount / profile.requestCount) * 100).toFixed(1)}% · ${profile.successCount}/${profile.requestCount}`
              : t('No production sample')
          }
        />
      </div>
      {props.actions ? (
        <div className='mt-3 flex flex-wrap items-center gap-2 border-t pt-3'>
          <span className='text-muted-foreground'>
            {t('Global routing')}:{' '}
            {globallyAllowed ? t('allowed') : t('disabled')}
          </span>
          <Button
            size='sm'
            variant='outline'
            title={
              modelBlocked
                ? t('This model is not allowed by the Global model allowlist')
                : undefined
            }
            disabled={
              !policy || togglePending || (!globallyAllowed && modelBlocked)
            }
            onClick={() => {
              if (!policy) return
              if (
                globallyAllowed &&
                !window.confirm(t('Disable this Profile from global routing?'))
              ) {
                return
              }
              props.actions?.onToggleRouting(profile, !globallyAllowed)
            }}
          >
            {globallyAllowed ? t('Disable routing') : t('Enable routing')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={!firstProtocol || probePending}
            onClick={() => {
              if (firstProtocol) props.actions?.onProbe(profile, firstProtocol)
            }}
          >
            {t('Probe test')}
          </Button>
        </div>
      ) : null}
      <div className='mt-3 border-t pt-3'>
        <StatusTimeline
          label={t('Probe')}
          buckets={(profile.probeBuckets ?? []).map((bucket) => ({
            key: bucket.bucket,
            tone: classifyProbeBucket(bucket),
            title: probeBucketTitle(bucket),
          }))}
        />
      </div>
      <div className='text-muted-foreground mt-2 text-[11px]'>
        {t('Latest Probe')}:{' '}
        {profile.latestProbe
          ? formatProbeResult(profile.latestProbe)
          : profile.probeStatus || t('never')}
      </div>
      <div className='text-muted-foreground mt-2'>
        {profile.protocol.map((value) => protocolLabel(value, t)).join(', ')}
      </div>
    </div>
  )
}

function ProfileMetric(props: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div className='mt-0.5 font-medium break-words'>{props.value}</div>
    </div>
  )
}

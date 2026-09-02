import { ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMultiplier } from '@/lib/format'

import type {
  ACUChannelMonitorProfile,
  ACUGlobalRoutingPolicy,
  ACUTokenProfileRoutingScope,
} from '../api'
import {
  classifyHistoryBucket,
  classifyProbeBucket,
  formatProbeResult,
  probeBucketTitle,
  type ACUChannelOverview,
} from './acu-channel-health-model'
import {
  isProfileGloballyAllowed,
  modelAccessFor,
} from './acu-global-routing-policy'
import { StatusTimeline } from './acu-health-timeline'
import {
  monitorReason,
  monitorStateLabel,
  protocolLabel,
  protocolShortLabel,
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

export function ACUChannelHealthCard(props: {
  channel: ACUChannelOverview
  generatedAt: string
  profileNoteActions?: {
    isPending: (profileId: string) => boolean
    onEdit: (profile: ACUChannelMonitorProfile) => void
  }
  tokenProfileActions?: {
    tokenName: string
    maskedKey: string
    scope?: ACUTokenProfileRoutingScope
    isPending: (profileId: string) => boolean
    onToggle: (profile: ACUChannelMonitorProfile, enabled: boolean) => void
  }
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
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const primary = props.channel.primaryProfile
  return (
    <section className='bg-background min-w-0 overflow-hidden rounded-lg border [contain-intrinsic-size:auto_420px] [content-visibility:auto]'>
      <button
        type='button'
        className='flex w-full min-w-0 items-start justify-between gap-3 p-3 text-left sm:p-4'
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
              <Badge
                key={value}
                variant='outline'
                title={protocolLabel(value, t)}
              >
                {protocolShortLabel(value, t)}
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
            {t('Targeted')} {props.channel.targetedProbeSuccessCount} /{' '}
            {props.channel.targetedProbeCount}
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
              : `#${primary.profileRank} / ${primary.profileCandidateCount} · ${
                  formatMultiplier(primary.multiplier) ?? t('n/a')
                }`}
          </div>
        </div>
      </div>

      <div className='bg-muted/10 space-y-3 p-3 sm:p-4'>
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
              ? `${t(props.channel.latestHealthEvent.source)} ${monitorStateLabel(props.channel.latestHealthEvent.result, t)} · ${relativeTime(props.channel.latestHealthEvent.at, i18n.language)}`
              : t('none')}
          </span>
          <span>{relativeTime(props.generatedAt, i18n.language)}</span>
        </div>
      </div>

      {expanded && (
        <div className='bg-muted/20 space-y-2 border-t p-3'>
          {props.channel.profiles.map((profile) => (
            <ChannelProfile
              key={profile.executionProfileId}
              profile={profile}
              actions={props.profileActions}
              noteActions={props.profileNoteActions}
              tokenActions={props.tokenProfileActions}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ChannelProfile(props: {
  profile: ACUChannelMonitorProfile
  noteActions?: {
    isPending: (profileId: string) => boolean
    onEdit: (profile: ACUChannelMonitorProfile) => void
  }
  tokenActions?: {
    tokenName: string
    maskedKey: string
    scope?: ACUTokenProfileRoutingScope
    isPending: (profileId: string) => boolean
    onToggle: (profile: ACUChannelMonitorProfile, enabled: boolean) => void
  }
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
  const { t, i18n } = useTranslation()
  const profile = props.profile
  const policy = props.actions?.policy
  const globallyAllowed =
    policy && isProfileGloballyAllowed(policy, profile.executionProfileId)
  const modelAccess =
    policy &&
    modelAccessFor(
      policy,
      profile.canonicalModel,
      true,
      profile.autoRouteEnabled !== false
    )
  const modelExposed = modelAccess !== 'disabled'
  const firstProtocol = profile.protocol[0]
  const togglePending =
    props.actions?.isTogglePending(profile.executionProfileId) ?? false
  const probePending =
    props.actions?.isProbePending(profile.executionProfileId) ?? false
  const notePending =
    props.noteActions?.isPending(profile.executionProfileId) ?? false
  const tokenScope = props.tokenActions?.scope
  const globallyAvailableForToken =
    tokenScope?.globalProfileIds.includes(profile.executionProfileId) ?? false
  const tokenAllowed =
    tokenScope?.effectiveProfileIds.includes(profile.executionProfileId) ??
    false
  const tokenTogglePending =
    props.tokenActions?.isPending(profile.executionProfileId) ?? false
  const isLastTokenProfile =
    tokenAllowed && tokenScope?.effectiveProfileIds.length === 1
  let globalRoutingStatus = t('Loading...')
  if (policy) {
    if (!modelExposed) {
      globalRoutingStatus = t('Model not externally exposed')
    } else {
      globalRoutingStatus = globallyAllowed ? t('allowed') : t('disabled')
    }
  }
  return (
    <details className='bg-background rounded-md border p-3 text-xs'>
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
      {profile.publicNote || props.noteActions ? (
        <div className='mt-2 flex min-w-0 items-center gap-1 text-[11px]'>
          <span className='text-muted-foreground shrink-0'>
            {t('Route note')}:
          </span>
          <span
            className='min-w-0 truncate'
            title={profile.publicNote || t('No public note')}
          >
            {profile.publicNote || t('No public note')}
          </span>
          {props.noteActions ? (
            <Button
              size='icon-xs'
              variant='ghost'
              className='shrink-0'
              title={t('Edit note')}
              aria-label={t('Edit note')}
              disabled={notePending}
              onClick={() => props.noteActions?.onEdit(profile)}
            >
              <Pencil aria-hidden='true' />
            </Button>
          ) : null}
        </div>
      ) : null}
      {props.actions && (
        <div className='mt-3 flex flex-wrap items-center gap-2 border-t pt-3'>
          <span className='text-muted-foreground'>
            {t('Global routing')}: {globalRoutingStatus}
          </span>
          <Button
            size='sm'
            variant='outline'
            disabled={!policy || togglePending || !modelExposed}
            onClick={() => {
              if (!policy) return
              if (globallyAllowed) {
                if (
                  !window.confirm(
                    t('Disable this Profile from global routing?')
                  )
                ) {
                  return
                }
                props.actions?.onToggleRouting(profile, false)
                return
              }
              props.actions?.onToggleRouting(profile, true)
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
      )}
      {props.tokenActions ? (
        <div className='mt-3 flex flex-wrap items-center gap-2 border-t pt-3'>
          <span className='text-muted-foreground'>
            {t('Global routing')}:{' '}
            {globallyAvailableForToken ? t('Allowed') : t('Disabled')}
          </span>
          <span className='text-muted-foreground'>
            {t('This API key')}: {tokenAllowed ? t('Allowed') : t('Disabled')}
          </span>
          <Button
            size='sm'
            variant='outline'
            title={
              isLastTokenProfile
                ? t('At least one ACU Profile must remain enabled')
                : undefined
            }
            disabled={
              !tokenScope ||
              !globallyAvailableForToken ||
              tokenTogglePending ||
              isLastTokenProfile
            }
            onClick={() => {
              const action = tokenAllowed ? t('Disable') : t('Enable')
              if (
                window.confirm(
                  t(
                    'Confirm {{action}} this Profile for API key {{name}} ({{key}})?',
                    {
                      action,
                      name: props.tokenActions?.tokenName,
                      key: props.tokenActions?.maskedKey,
                    }
                  )
                )
              ) {
                props.tokenActions?.onToggle(profile, !tokenAllowed)
              }
            }}
          >
            {tokenAllowed
              ? t('Disable for this API key')
              : t('Enable for this API key')}
          </Button>
        </div>
      ) : null}
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
          value={formatMultiplier(profile.multiplier) ?? 'n/a'}
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
          label={t('Targeted Probes')}
          value={`${profile.targetedProbeSuccessCount}/${profile.targetedProbeCount}`}
        />
        <ProfileField
          label={t('p50 / p95')}
          value={`${milliseconds(profile.p50FirstModelEventLatencyMs)} / ${milliseconds(profile.p95FirstModelEventLatencyMs)}`}
        />
        <ProfileField
          label={t('Latest Probe')}
          value={[
            `${profile.probeStatus || 'never'} · ${milliseconds(profile.probeLatencyMs)} · ${relativeTime(profile.lastProbeAt, i18n.language)}`,
            formatProbeResult(profile.latestProbe, false),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <div className='sm:col-span-2 lg:col-span-4'>
          <StatusTimeline
            label={t('Probe')}
            buckets={(profile.probeBuckets ?? []).map((bucket) => ({
              key: bucket.bucket,
              tone: classifyProbeBucket(bucket),
              title: probeBucketTitle(bucket),
            }))}
          />
        </div>
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

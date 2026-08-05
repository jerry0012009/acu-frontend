/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import type { ACUChannelMonitorProfile } from '../api'
import {
  classifyHistoryBucket,
  type ACUChannelOverview,
} from './acu-channel-health-model'

function milliseconds(value?: number | null) {
  if (!value) return 'n/a'
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`
}

function relativeTime(value?: string | null) {
  if (!value) return 'n/a'
  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000)
  )
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`
  return `${Math.floor(elapsedSeconds / 86400)}d ago`
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
  const { t } = useTranslation()
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
              label={props.channel.state}
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
              {props.channel.profiles.length} {t('Profiles')}
            </span>
          </div>
        </div>
      </button>

      <div className='bg-border grid gap-px border-y sm:grid-cols-3'>
        <ChannelMetric
          label={t('Primary p50')}
          value={milliseconds(primary?.p50FirstModelEventLatencyMs)}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className='bg-background p-3 text-left'>
              <ChannelMetric
                label={t('Primary p95')}
                value={milliseconds(primary?.p95FirstModelEventLatencyMs)}
                compact
              />
            </TooltipTrigger>
            <TooltipContent>{t('First model event p95')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className='bg-background p-3 text-left'>
              <ChannelMetric
                label={t('Latest Probe')}
                value={
                  primary?.probeStatus
                    ? `${primary.probeStatus} · ${milliseconds(primary.probeLatencyMs)}`
                    : t('never')
                }
                compact
              />
            </TooltipTrigger>
            <TooltipContent>
              {primary?.lastProbeAt
                ? relativeTime(primary.lastProbeAt)
                : t('No probe records')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className='space-y-3 p-4'>
        <div>
          <div className='text-sm font-semibold'>
            {props.channel.availability === null
              ? t('No production samples')
              : `${(props.channel.availability * 100).toFixed(2)}%`}
          </div>
          {props.channel.availability !== null && (
            <div className='text-muted-foreground text-xs'>
              {props.channel.successCount} / {props.channel.requestCount}{' '}
              {t('successful requests')}
            </div>
          )}
        </div>
        <div
          className='flex h-5 w-full gap-0.5'
          aria-label={t('Recent production status')}
        >
          {props.channel.buckets.map((bucket) => (
            <span
              key={bucket.bucket}
              className={cn(
                'min-w-0 flex-1 rounded-[1px]',
                bucketTone[classifyHistoryBucket(bucket)]
              )}
              title={`${new Date(bucket.bucket).toLocaleString()} · ${bucket.success_count}/${bucket.request_count}`}
            />
          ))}
          {props.channel.buckets.length === 0 && (
            <span className='bg-muted h-full w-full rounded-sm' />
          )}
        </div>
        <div className='text-muted-foreground flex flex-wrap justify-between gap-2 text-xs'>
          <span>
            {props.channel.eligibleProfileCount} /{' '}
            {props.channel.enabledProfileCount} {t('eligible')}
          </span>
          <span>
            {props.channel.modelCount} {t('models')}
          </span>
          <span>
            {primary?.profileUtility === null || !primary
              ? t('No routing score')
              : `${t('Primary Profile')} · ${t('same-model rank')} #${primary.profileRank}/${primary.profileCandidateCount}`}
          </span>
          <span>{relativeTime(props.generatedAt)}</span>
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

function ChannelMetric(props: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div className={cn(!props.compact && 'bg-background p-3')}>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div className='mt-1 truncate text-sm font-medium'>{props.value}</div>
    </div>
  )
}

function ChannelProfile(props: { profile: ACUChannelMonitorProfile }) {
  const { t } = useTranslation()
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
              label={profile.state}
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
          value={profile.protocol.join(', ')}
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
          label={t('Evidence')}
          value={`${profile.successCount}/${profile.requestCount} · ${profile.firstEventSampleCount} first-event`}
        />
        <ProfileField
          label={t('p50 / p95')}
          value={`${milliseconds(profile.p50FirstModelEventLatencyMs)} / ${milliseconds(profile.p95FirstModelEventLatencyMs)}`}
        />
        <ProfileField
          label={t('Latest Probe')}
          value={`${profile.probeStatus || 'never'} · ${milliseconds(profile.probeLatencyMs)} · ${relativeTime(profile.lastProbeAt)}`}
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
          value={profile.metricSource || 'n/a'}
        />
        <ProfileField
          label={t('Last error')}
          value={profile.lastError || 'none'}
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

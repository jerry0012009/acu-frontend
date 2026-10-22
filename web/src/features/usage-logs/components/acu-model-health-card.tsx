import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'
import { cn } from '@/lib/utils'

import type { ACUProbeTimelineRange } from '../api'
import {
  classifyHistoryBucket,
  classifyModelProbeBucket,
  probeBucketTitle,
  type ACUModelOverview,
} from './acu-channel-health-model'
import { StatusTimeline } from './acu-health-timeline'
import { ACUModelPriceRange } from './acu-model-price-range'
import {
  ACUMonitorProfile,
  type ACUMonitorProfileActions,
} from './acu-monitor-profile'

export function ACUModelHealthCard(
  props: ACUMonitorProfileActions & {
    model: ACUModelOverview
    focusedLine?: string
    showDiagnostics?: boolean
    probeRange?: ACUProbeTimelineRange
    priceScenario?: string
  }
) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(() =>
    Boolean(
      props.focusedLine &&
      props.model.profiles.some(
        (profile) =>
          publicChannelAlias(profile.provider, profile.channel) ===
          props.focusedLine
      )
    )
  )
  const profiles = props.focusedLine
    ? props.model.profiles.filter(
        (profile) =>
          publicChannelAlias(profile.provider, profile.channel) ===
          props.focusedLine
      )
    : props.model.profiles
  const token = props.tokenProfileActions
  return (
    <section
      className={cn(
        'bg-background min-w-0 self-start overflow-hidden rounded-lg border',
        expanded && 'xl:col-span-2'
      )}
    >
      <button
        type='button'
        className='flex w-full min-w-0 items-center gap-2 p-3 text-left sm:p-4'
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? (
          <ChevronDown className='size-4 shrink-0' />
        ) : (
          <ChevronRight className='size-4 shrink-0' />
        )}
        <h3 className='min-w-0 text-sm font-semibold break-all'>
          {props.model.modelId}
        </h3>
        <Badge variant='outline'>
          {props.model.eligibleCount}/{props.model.totalCount}{' '}
          {t('available lines')}
        </Badge>
      </button>
      <div className='bg-muted/10 space-y-2 border-t p-3 sm:px-4'>
        {props.showDiagnostics && (
          <StatusTimeline
            label={t('Production')}
            buckets={props.model.buckets.map((bucket) => ({
              key: bucket.bucket,
              tone: classifyHistoryBucket(bucket),
              title: `${new Date(bucket.bucket).toLocaleString()} · ${bucket.success_count}/${bucket.request_count}`,
            }))}
          />
        )}
        <StatusTimeline
          label={`${t('Probe')} · ${props.probeRange ?? '48h'}`}
          buckets={props.model.probeBuckets.map((bucket) => ({
            key: bucket.bucket,
            tone: classifyModelProbeBucket(bucket),
            title: probeBucketTitle(bucket),
          }))}
        />
        {props.showDiagnostics && (
          <div className='text-muted-foreground text-xs'>
            {props.model.availability === null
              ? t('No production traffic')
              : `${props.model.successCount}/${props.model.requestCount} · ${(props.model.availability * 100).toFixed(2)}%`}
          </div>
        )}
      </div>
      {expanded && (
        <>
          {token && (
            <div className='bg-muted/20 border-t px-3 py-3 sm:px-4'>
              <div className='mb-2 text-xs font-medium break-words'>
                {t('This API key')}: {token.tokenName}
              </div>
              {token.scope && token.onApply && (
                <ACUModelPriceRange
                  key={`${token.scope.tokenId}:${props.model.modelId}:${props.priceScenario}`}
                  modelId={props.model.modelId}
                  profiles={profiles}
                  scope={token.scope}
                  scenario={props.priceScenario}
                  pending={profiles.some((profile) =>
                    token.isPending(profile.executionProfileId)
                  )}
                  onApply={token.onApply}
                />
              )}
            </div>
          )}
          <div className='border-t'>
            {profiles.map((profile) => (
              <ACUMonitorProfile
                {...props}
                key={`${token?.scope?.tokenId ?? ''}:${profile.executionProfileId}`}
                profile={profile}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

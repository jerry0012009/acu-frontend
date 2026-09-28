import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { ACUChannelMonitorProfile } from '../api'
import { profileLatencyDisplay } from './acu-monitor-presentation'

function number(value: number | null | undefined, digits = 4): string {
  return value == null || !Number.isFinite(value)
    ? 'n/a'
    : value.toFixed(digits)
}

function milliseconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return 'n/a'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(2)} s`
}

function Metric(props: { label: string; value: string; detail?: string }) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div className='mt-0.5 break-words'>{props.value}</div>
      {props.detail ? (
        <div className='text-muted-foreground mt-0.5 text-[11px] break-words'>
          {props.detail}
        </div>
      ) : null}
    </div>
  )
}

export function ACUProfileScoreDetails(props: {
  profile: ACUChannelMonitorProfile
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const profile = props.profile
  const latency = profileLatencyDisplay(profile, t)
  const baseUtility =
    profile.costContribution != null &&
    profile.speedContribution != null &&
    profile.reliabilityContribution != null
      ? profile.costContribution +
        profile.speedContribution +
        profile.reliabilityContribution
      : null
  return (
    <>
      <Button
        type='button'
        size='icon-xs'
        variant='ghost'
        title={t('View routing score details')}
        aria-label={t('View routing score details')}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <Info aria-hidden='true' />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[90vh] w-[min(48rem,calc(100%-1rem))] max-w-none overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{t('Routing score details')}</DialogTitle>
            <DialogDescription className='break-all'>
              {profile.executionProfileId}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4 text-xs'>
            <div className='grid gap-3 rounded border p-3 sm:grid-cols-3'>
              <Metric
                label={t('Final utility')}
                value={number(profile.profileUtility)}
                detail={
                  baseUtility == null
                    ? undefined
                    : `${t('Base utility')} ${number(baseUtility)} × ${number(profile.profilePreferenceMultiplier, 2)}`
                }
              />
              <Metric
                label={t('Rank')}
                value={
                  profile.profileRank == null
                    ? t('Not scored')
                    : `#${profile.profileRank}/${profile.profileCandidateCount ?? '?'}`
                }
              />
              <Metric
                label={t('Formula')}
                value={t('Weighted components × Profile Preference')}
              />
            </div>
            <section className='space-y-2'>
              <h4 className='font-medium'>{t('Cost component')}</h4>
              <div className='grid gap-3 rounded border p-3 sm:grid-cols-3'>
                <Metric
                  label={t('Profile cost')}
                  value={
                    profile.profileCost == null
                      ? 'n/a'
                      : `${profile.profileCost.toFixed(6)} CNY`
                  }
                />
                <Metric
                  label={t('Normalized cost utility')}
                  value={number(profile.costUtility)}
                  detail={`${t('Raw')} ${number(profile.rawCostUtility)}`}
                />
                <Metric
                  label={t('Weighted contribution')}
                  value={number(profile.costContribution)}
                />
              </div>
            </section>
            <section className='space-y-2'>
              <h4 className='font-medium'>{t('Speed component')}</h4>
              <div className='grid gap-3 rounded border p-3 sm:grid-cols-3'>
                <Metric
                  label={t('Used latency')}
                  value={latency.value}
                  detail={`${t('Source')}: ${latency.source ?? t('Unknown')}`}
                />
                <Metric
                  label={t('Production latency')}
                  value={milliseconds(profile.p50FirstModelEventLatencyMs)}
                  detail={`${profile.firstEventSampleCount} ${t('samples')}`}
                />
                <Metric
                  label={t('Scored Probe latency')}
                  value={milliseconds(profile.scoredProbeLatencyP50Ms)}
                  detail={`${profile.scoredProbeLatencySampleCount} ${t('latency samples')} · P90 ${milliseconds(profile.scoredProbeLatencyP90Ms)}`}
                />
                <Metric
                  label={t('Full Pool Probe latency')}
                  value={milliseconds(profile.fullPoolProbeLatencyP50Ms)}
                  detail={`${profile.fullPoolProbeLatencySampleCount ?? 0} ${t('latency samples')} · P90 ${milliseconds(profile.fullPoolProbeLatencyP90Ms)}`}
                />
                <Metric
                  label={t('Normalized speed utility')}
                  value={number(profile.speedUtility)}
                  detail={`${t('Raw')} ${number(profile.rawSpeedUtility)}`}
                />
                <Metric
                  label={t('Weighted contribution')}
                  value={number(profile.speedContribution)}
                />
              </div>
            </section>
            <section className='space-y-2'>
              <h4 className='font-medium'>{t('Reliability component')}</h4>
              <div className='grid gap-3 rounded border p-3 sm:grid-cols-3'>
                <Metric
                  label={t('Production reliability')}
                  value={`${profile.productionReliabilitySuccesses ?? 0}/${profile.productionReliabilitySamples ?? 0}`}
                  detail={t('Recent valid production samples')}
                />
                <Metric
                  label={t('Scored Probe reliability')}
                  value={`${profile.scoredProbeSuccessCount}/${profile.scoredProbeCount}`}
                  detail={`${t('Full Pool')} ${profile.fullPoolProbeSuccessCount}/${profile.fullPoolProbeCount} · ${t('Targeted')} ${profile.targetedProbeSuccessCount}/${profile.targetedProbeCount}`}
                />
                <Metric
                  label={t('Normalized reliability utility')}
                  value={number(profile.reliabilityUtility)}
                  detail={`${t('Raw')} ${number(profile.rawReliabilityUtility)}`}
                />
                <Metric
                  label={t('Weighted contribution')}
                  value={number(profile.reliabilityContribution)}
                />
              </div>
            </section>
            <div className='text-muted-foreground rounded border p-3'>
              {t(
                'Scores use the current routing policy and recorded evidence. The latency source above identifies the observations used; unavailable measurements are not zero.'
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

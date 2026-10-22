import { Activity, ChevronDown, Pencil, Save, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { publicChannelAlias } from '@/features/acu/lib/public-channel-alias'
import { formatMultiplier } from '@/lib/format'

import type {
  ACUChannelMonitorProfile,
  ACUGlobalRoutingPolicy,
  ACUProbeTimelineRange,
  ACUTokenProfileRoutingScope,
} from '../api'
import {
  classifyProbeBucket,
  formatProbeResult,
  probeBucketTitle,
} from './acu-channel-health-model'
import { modelAccessFor } from './acu-global-routing-policy'
import { StatusTimeline } from './acu-health-timeline'
import {
  monitorProfileEligible,
  monitorReason,
  monitorStateLabel,
  profileLatencyDisplay,
  protocolShortLabel,
} from './acu-monitor-presentation'
import { ACUProfileScoreDetails } from './acu-profile-score-details'
import { ACUTokenProfileWeight } from './acu-token-profile-weight'

type Profile = ACUChannelMonitorProfile
type SaveResult = void | Promise<unknown>

export type ACUMonitorProfileActions = {
  tokenProfileActions?: {
    tokenName: string
    maskedKey: string
    scope?: ACUTokenProfileRoutingScope
    isPending: (id: string) => boolean
    onToggle: (profile: Profile, enabled: boolean) => SaveResult
    onSetWeight?: (profile: Profile, weight: number) => SaveResult
    onInheritWeight?: (profile: Profile) => SaveResult
    onApply?: (
      modelId: string,
      states: Record<string, boolean>
    ) => Promise<unknown>
  }
  profileNoteActions?: {
    isPending: (id: string) => boolean
    onEdit: (profile: Profile, note: string) => SaveResult
  }
  profileActions?: {
    isProbePending: (id: string) => boolean
    onProbe: (profile: Profile, protocol: string) => void
  }
  globalProfileActions?: {
    policy?: ACUGlobalRoutingPolicy
    isTogglePending: (id: string) => boolean
    onToggleRouting: (profile: Profile, enabled: boolean) => void
  }
  veridropActions?: {
    isPending: (id: string) => boolean
    onCheck: (profile: Profile, protocol: string) => void
  }
  gpttesticuActions?: {
    isPending: (id: string) => boolean
    onCheck: (profile: Profile) => void
    onStart: (profile: Profile) => void
  }
}

export function ACUMonitorProfile(
  props: ACUMonitorProfileActions & {
    profile: Profile
    showModel?: boolean
    showDiagnostics?: boolean
    probeRange?: ACUProbeTimelineRange
  }
) {
  const { t } = useTranslation()
  const profile = props.profile
  const id = profile.executionProfileId
  const token = props.tokenProfileActions
  const scope = token?.scope
  const allowed = scope?.globalProfileIds.includes(id) ?? false
  const enabled = scope?.effectiveProfileIds.includes(id) ?? false
  const tokenPending = token?.isPending(id) ?? false
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [toggleMessage, setToggleMessage] = useState('')
  const [toggleError, setToggleError] = useState(false)
  const notePending = props.profileNoteActions?.isPending(id) ?? false
  const latency = profileLatencyDisplay(profile, t)
  const eligible = profile.routingEnabled && monitorProfileEligible(profile)
  const policy = props.globalProfileActions?.policy
  const modelExposed =
    policy &&
    modelAccessFor(
      policy,
      profile.canonicalModel,
      true,
      profile.routingEnabled
    ) !== 'disabled'
  const protocol = profile.protocol[0]
  const checking =
    props.profileActions?.isProbePending(id) ||
    props.veridropActions?.isPending(id) ||
    props.gpttesticuActions?.isPending(id)
  let status = profile.state
  if (!profile.routingEnabled) status = 'disabled'
  else if (eligible) status = 'eligible'

  return (
    <article
      className='min-w-0 border-t px-3 py-4 first:border-t-0 sm:px-4'
      aria-label={publicChannelAlias(profile.provider, profile.channel)}
    >
      <div className='grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(12rem,1.5fr)_minmax(15rem,1fr)_minmax(19rem,1.2fr)]'>
        <div className='min-w-0 space-y-1'>
          <div className='text-sm font-medium break-words'>
            {props.showModel
              ? profile.canonicalModel
              : publicChannelAlias(profile.provider, profile.channel)}
          </div>
          <div className='text-muted-foreground text-xs'>
            {profile.protocol
              .map((value) => protocolShortLabel(value, t))
              .join(' · ')}
          </div>
          {editing ? (
            <form
              className='flex min-w-0 flex-wrap items-center gap-1'
              onSubmit={async (event) => {
                event.preventDefault()
                if (notePending) return
                setNoteError('')
                try {
                  await props.profileNoteActions?.onEdit(profile, note)
                  setEditing(false)
                  setNoteSaved(true)
                } catch (error) {
                  setNoteError(
                    error instanceof Error
                      ? error.message
                      : t('Profile note update failed')
                  )
                }
              }}
            >
              <input
                autoFocus
                aria-label={t('Public note visible to users')}
                maxLength={500}
                className='bg-background h-8 min-w-0 flex-1 rounded border px-2 text-xs'
                value={note}
                disabled={notePending}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button
                size='icon-sm'
                variant='ghost'
                type='submit'
                disabled={notePending}
                title={t('Save note')}
                aria-label={t('Save note')}
              >
                <Save />
              </Button>
              <Button
                size='icon-sm'
                variant='ghost'
                type='button'
                disabled={notePending}
                title={t('Cancel')}
                aria-label={t('Cancel')}
                onClick={() => setEditing(false)}
              >
                <X />
              </Button>
              {noteError && (
                <p role='alert' className='text-destructive w-full text-xs'>
                  {noteError}
                </p>
              )}
            </form>
          ) : (
            <div className='flex min-w-0 items-start gap-1 text-xs'>
              <span className='text-muted-foreground min-w-0 break-words'>
                {profile.publicNote || t('No public note')}
              </span>
              {props.profileNoteActions && (
                <Button
                  size='icon-xs'
                  variant='ghost'
                  title={t('Edit public note')}
                  aria-label={t('Edit public note')}
                  onClick={() => {
                    setNote(profile.publicNote ?? '')
                    setNoteError('')
                    setNoteSaved(false)
                    setEditing(true)
                  }}
                >
                  <Pencil />
                </Button>
              )}
              {noteSaved && (
                <span role='status' className='text-muted-foreground'>
                  {t('Saved')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className='grid grid-cols-3 gap-2 text-xs'>
          <div>
            <div className='text-muted-foreground'>{t('Price factor')}</div>
            <div className='mt-1 font-medium tabular-nums'>
              {profile.effectivePriceMultiplier == null
                ? t('No price data')
                : (formatMultiplier(profile.effectivePriceMultiplier, '×') ??
                  t('No price data'))}
            </div>
          </div>
          <div>
            <div className='text-muted-foreground'>{t('Response latency')}</div>
            <div className='mt-1 font-medium' title={latency.source}>
              {latency.value}
            </div>
          </div>
          <div>
            <div className='text-muted-foreground'>{t('Status')}</div>
            <div className='mt-1'>
              <StatusBadge
                copyable={false}
                variant={eligible ? 'success' : 'neutral'}
                label={monitorStateLabel(status, t)}
              />
            </div>
          </div>
        </div>
        {token && (
          <div className='min-w-0 space-y-2'>
            <div className='flex flex-wrap items-center gap-2 text-xs'>
              <Switch
                size='sm'
                aria-label={t('Enable for this API key')}
                checked={enabled}
                disabled={
                  !scope ||
                  !allowed ||
                  tokenPending ||
                  (enabled && scope.effectiveProfileIds.length === 1)
                }
                onCheckedChange={async (checked) => {
                  setToggleMessage('')
                  setToggleError(false)
                  try {
                    await token.onToggle(profile, checked)
                    setToggleMessage(t('Saved'))
                  } catch (error) {
                    setToggleError(true)
                    setToggleMessage(
                      error instanceof Error
                        ? error.message
                        : t('API key routing update failed')
                    )
                  }
                }}
              />
              <span>
                {t('This API key')}: {enabled ? t('Enabled') : t('Disabled')}
              </span>
              {!allowed && scope && (
                <span className='text-muted-foreground'>
                  {t('Disabled globally')}
                </span>
              )}
              {tokenPending && <span role='status'>{t('Saving...')}</span>}
              {!tokenPending && toggleMessage && (
                <span
                  role={toggleError ? 'alert' : 'status'}
                  className={
                    toggleError ? 'text-destructive' : 'text-muted-foreground'
                  }
                >
                  {toggleMessage}
                </span>
              )}
            </div>
            {scope && allowed && token.onSetWeight && token.onInheritWeight && (
              <ACUTokenProfileWeight
                key={`${scope.tokenId}:${id}`}
                profile={profile}
                scope={scope}
                pending={tokenPending}
                onSetWeight={token.onSetWeight}
                onInheritWeight={token.onInheritWeight}
              />
            )}
          </div>
        )}
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-3'>
        {(props.profileActions ||
          props.veridropActions ||
          props.gpttesticuActions) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size='sm' variant='ghost' />}
              disabled={checking}
            >
              <Activity className='size-3.5' />
              {checking ? t('Checking...') : t('Diagnostics')}
              <ChevronDown className='size-3.5' />
            </DropdownMenuTrigger>
            <DropdownMenuContent className='w-48'>
              {props.profileActions && (
                <DropdownMenuItem
                  disabled={!protocol}
                  onClick={() =>
                    props.profileActions?.onProbe(profile, protocol)
                  }
                >
                  {t('Probe test')}
                </DropdownMenuItem>
              )}
              {props.veridropActions && (
                <DropdownMenuItem
                  disabled={!protocol}
                  onClick={() =>
                    props.veridropActions?.onCheck(profile, protocol)
                  }
                >
                  {t('Veridrop')}
                </DropdownMenuItem>
              )}
              {props.gpttesticuActions && (
                <DropdownMenuItem
                  disabled={!profile.protocol.includes('responses')}
                  onClick={() => props.gpttesticuActions?.onCheck(profile)}
                >
                  {t('SVG behavior')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {props.globalProfileActions && (
          <div className='ml-auto flex flex-wrap items-center gap-2 text-xs'>
            <span className='text-muted-foreground'>{t('Global routing')}</span>
            <Switch
              size='sm'
              aria-label={t('Global routing')}
              checked={profile.routingEnabled}
              disabled={
                !modelExposed || props.globalProfileActions.isTogglePending(id)
              }
              onCheckedChange={(checked) => {
                if (
                  !window.confirm(
                    [
                      t(
                        checked
                          ? 'Enable this Profile for global routing?'
                          : 'Disable this Profile from global routing?'
                      ),
                      `${t('Line')}: ${profile.channel}`,
                      `${t('Price factor')}: ${profile.effectivePriceMultiplier == null ? t('No price data') : formatMultiplier(profile.effectivePriceMultiplier, '×')}`,
                      `${t('Note')}: ${profile.publicNote || t('No public note')}`,
                      `${t('Execution Profile ID')}: ${profile.executionProfileId}`,
                    ].join('\n')
                  )
                ) {
                  return
                }
                props.globalProfileActions?.onToggleRouting(profile, checked)
              }}
            />
            <span>{profile.routingEnabled ? t('Enabled') : t('Disabled')}</span>
          </div>
        )}
      </div>
      <details className='mt-2 text-xs'>
        <summary className='text-muted-foreground w-fit cursor-pointer py-1'>
          {t('Details')}
        </summary>
        <div className='mt-2 space-y-3'>
          {props.showDiagnostics && (
            <>
              <div className='text-muted-foreground font-mono text-[11px] break-all'>
                {profile.provider} · {profile.channel} · {id}
              </div>
              <ACUProfileScoreDetails profile={profile} />
              <div>
                {t('Routing score')}:{' '}
                {profile.profileUtility?.toFixed(3) ?? t('Not scored')} · #
                {profile.profileRank ?? '?'}/
                {profile.profileCandidateCount ?? '?'}
              </div>
              <div>
                {t('Multiplier')}:{' '}
                {profile.multiplier == null
                  ? t('n/a')
                  : formatMultiplier(profile.multiplier)}
              </div>
              <div>
                {t('Production')}: {profile.successCount}/{profile.requestCount}
              </div>
              <div>
                {t('Judge Attempts')}: {profile.judgeSuccessCount ?? 0}/
                {profile.judgeAttemptCount ?? 0}
              </div>
              <div>
                {t('Full-pool Probes')}:{' '}
                {profile.fullPoolProbeSuccessCount ?? 0}/
                {profile.fullPoolProbeCount ?? 0}
              </div>
              <div>
                {t('Targeted Probes')}: {profile.targetedProbeSuccessCount ?? 0}
                /{profile.targetedProbeCount ?? 0}
              </div>
              <div>
                {t('Metric source')}: {profile.metricSource || t('n/a')} ·{' '}
                {profile.firstEventSampleCount ?? 0} first-event
              </div>
              <div>
                {t('p50 / p95')}:{' '}
                {profile.p50FirstModelEventLatencyMs ?? t('n/a')} /{' '}
                {profile.p95FirstModelEventLatencyMs ?? t('n/a')} ms
              </div>
              <div>
                {t('Profile Preference')}:{' '}
                {profile.profilePreferenceScore ?? t('n/a')} ·{' '}
                {profile.profilePreferenceMultiplier == null
                  ? t('n/a')
                  : (formatMultiplier(profile.profilePreferenceMultiplier) ??
                    t('n/a'))}
              </div>
              <div>
                {t('Contributions')}:{' '}
                {profile.costContribution?.toFixed(3) ?? t('n/a')} /{' '}
                {profile.speedContribution?.toFixed(3) ?? t('n/a')} /{' '}
                {profile.reliabilityContribution?.toFixed(3) ?? t('n/a')}
              </div>
              <div>
                {t('Eligibility')}: {profile.routingEligibility} ·{' '}
                {profile.blockingScope || t('none')}
              </div>
              <div>
                {t('Last error')}:{' '}
                {
                  monitorReason(profile.lastError || profile.statusReason, t)
                    .title
                }{' '}
                ·{' '}
                {
                  monitorReason(profile.lastError || profile.statusReason, t)
                    .code
                }
              </div>
              {profile.cooldownUntil && (
                <div>
                  {t('Cooldown')}:{' '}
                  {new Date(profile.cooldownUntil).toLocaleString()}
                </div>
              )}
            </>
          )}
          <StatusTimeline
            label={`${t('Probe')} · ${props.probeRange ?? '48h'}`}
            buckets={(profile.probeBuckets ?? []).map((bucket) => ({
              key: bucket.bucket,
              tone: classifyProbeBucket(bucket),
              title: probeBucketTitle(bucket),
            }))}
          />
          <div className='text-muted-foreground break-words'>
            {t('Latest Probe')}:{' '}
            {profile.latestProbe
              ? formatProbeResult(profile.latestProbe)
              : profile.probeStatus || t('never')}
            {profile.lastProbeAt &&
              ` · ${new Date(profile.lastProbeAt).toLocaleString()}`}
            {profile.probeLatencyMs != null &&
              ` · ${profile.probeLatencyMs} ms`}
          </div>
        </div>
      </details>
    </article>
  )
}

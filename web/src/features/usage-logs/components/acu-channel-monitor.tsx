import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  CircleOff,
  Clock3,
  Gauge,
  HeartPulse,
  Network,
  RefreshCw,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsAdmin } from '@/hooks/use-admin'

import {
  getACUChannelMonitor,
  pauseACUChannel,
  type ACUChannelMonitorProfile,
  type ACUModelPoolEntry,
  type ACUMonitorRange,
} from '../api'
import { ACUChannelHistory } from './acu-channel-history'

function ms(value?: number) {
  if (!value) return 'n/a'
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`
}

function stateTone(state: string) {
  if (state === 'healthy') return 'secondary'
  if (state === 'degraded' || state === 'half_open') return 'outline'
  return 'destructive'
}

function profileFilterValues(
  profiles: ACUChannelMonitorProfile[],
  key: 'model' | 'provider' | 'protocol' | 'state'
) {
  if (key === 'model') return profiles.map((item) => item.canonicalModel)
  if (key === 'protocol') return profiles.flatMap((item) => item.protocol)
  return profiles.map((item) => item[key])
}

export function ACUChannelMonitor() {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const queryClient = useQueryClient()
  const [range, setRange] = useState<ACUMonitorRange>('24h')
  const [filters, setFilters] = useState({
    model: '',
    provider: '',
    protocol: '',
    state: '',
  })
  const query = useQuery({
    queryKey: ['acu-channel-monitor', range],
    queryFn: () => getACUChannelMonitor(range),
    refetchInterval: 60_000,
  })
  const pause = useMutation({
    mutationFn: ({
      channel,
      duration,
    }: {
      channel: string
      duration: 30 | 120
    }) => pauseACUChannel(channel, duration),
    onSuccess: () => {
      toast.success(t('Channel paused'))
      void queryClient.invalidateQueries({ queryKey: ['acu-channel-monitor'] })
    },
    onError: () => toast.error(t('Channel pause failed')),
  })
  const profiles = useMemo(
    () =>
      (query.data?.data?.profiles ?? []).filter(
        (profile) =>
          (!filters.model || profile.canonicalModel === filters.model) &&
          (!filters.provider || profile.provider === filters.provider) &&
          (!filters.protocol || profile.protocol.includes(filters.protocol)) &&
          (!filters.state || profile.state === filters.state)
      ),
    [filters, query.data]
  )
  const allProfiles = query.data?.data?.profiles ?? []
  const summary = {
    active: allProfiles.filter(
      (item) => item.enabled && item.administratorAllowed
    ).length,
    providers: new Set(allProfiles.map((item) => item.provider)).size,
    healthy: allProfiles.filter((item) => item.state === 'healthy').length,
    degraded: allProfiles.filter(
      (item) => item.state === 'degraded' || item.state === 'half_open'
    ).length,
    cooldown: allProfiles.filter((item) => item.state === 'open').length,
    disabled: allProfiles.filter(
      (item) => item.state === 'disabled' || !item.enabled
    ).length,
  }
  const statItems = [
    [t('Active Profiles'), summary.active, Activity],
    [t('Independent Providers'), summary.providers, Network],
    [t('Healthy'), summary.healthy, HeartPulse],
    [t('Degraded'), summary.degraded, Gauge],
    [t('Cooldown'), summary.cooldown, Clock3],
    [t('Disabled'), summary.disabled, CircleOff],
  ] as const
  return (
    <div className='flex h-full min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-base font-semibold'>{t('Channel Monitor')}</h2>
          <p className='text-muted-foreground text-xs'>
            {t('Execution supply health, recovery and verified inventory.')}
          </p>
        </div>
        <Button
          variant='outline'
          size='icon'
          title={t('Refresh')}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className='size-4' />
        </Button>
      </div>
      <div className='grid grid-cols-2 gap-px overflow-hidden rounded border bg-border lg:grid-cols-6'>
        {statItems.map(([label, value, Icon]) => (
          <div key={label} className='bg-background min-w-0 p-3'>
            <div className='text-muted-foreground flex items-center gap-1.5 text-[11px]'>
              <Icon className='size-3.5' />
              {label}
            </div>
            <div className='mt-1 text-sm font-semibold'>{value}</div>
          </div>
        ))}
      </div>
      <Tabs defaultValue='current' className='min-w-0'>
        <TabsList>
          <TabsTrigger value='current'>{t('Current')}</TabsTrigger>
          <TabsTrigger value='history'>{t('History')}</TabsTrigger>
          <TabsTrigger value='inventory'>{t('Supply inventory')}</TabsTrigger>
          <TabsTrigger value='models'>{t('Model pool')}</TabsTrigger>
        </TabsList>
        <TabsContent value='current' className='min-w-0 space-y-3'>
          <div className='flex flex-wrap gap-2'>
            {(['model', 'protocol', 'provider', 'state'] as const).map(
              (key) => (
                <select
                  key={key}
                  aria-label={key}
                  className='bg-background h-8 rounded border px-2 text-xs'
                  value={filters[key]}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value=''>
                    {t('All')} {key}
                  </option>
                  {[...new Set(profileFilterValues(allProfiles, key))]
                    .filter(Boolean)
                    .sort()
                    .map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </select>
              )
            )}
          </div>
          <MonitorTable
            profiles={profiles}
            canPause={isAdmin}
            onPause={(channel, duration) => pause.mutate({ channel, duration })}
          />
        </TabsContent>
        <TabsContent value='history' className='min-w-0 space-y-3'>
          <ACUChannelHistory
            range={range}
            onRangeChange={setRange}
            profiles={query.data?.data?.profiles ?? []}
            rows={query.data?.data?.history ?? []}
            cooldownIntervals={query.data?.data?.cooldownIntervals ?? []}
          />
        </TabsContent>
        <TabsContent value='inventory' className='min-w-0'>
          <InventoryTable rows={query.data?.data?.supplyInventory ?? []} />
        </TabsContent>
        <TabsContent value='models' className='min-w-0'>
          <ModelPoolTable rows={query.data?.data?.modelPool ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ModelPoolTable({ rows }: { rows: ACUModelPoolEntry[] }) {
  const { t } = useTranslation()
  return (
    <div className='max-w-full overflow-x-auto rounded border'>
      <table className='w-full min-w-[1120px] text-left text-xs'>
        <thead className='bg-muted/50'>
          <tr>
            {[
              'Model',
              'Vendor / Tier',
              'Protocol',
              'Verification',
              'Profiles',
              'Providers',
              'Best / Backup Channel',
              'Multiplier',
              'Auto Route',
              'Exclusion Reason',
            ].map((label) => (
              <th key={label} className='px-3 py-2 font-medium'>{t(label)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((model) => (
            <tr key={model.modelId} className='border-t align-top'>
              <td className='px-3 py-2.5'>
                <details>
                  <summary className='cursor-pointer font-medium'>{model.modelId}</summary>
                  <div className='text-muted-foreground mt-2 space-y-1 pl-3'>
                    {model.profiles.map((profile) => (
                      <div key={profile.executionProfileId}>
                        {profile.provider} · {profile.channel} · {profile.routingEligibility}
                        {profile.requiresFreshProbe && (
                          <> · Probe {profile.probeFreshness} / {profile.probeStatus || 'never'}</>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </td>
              <td className='px-3 py-2.5'>{model.vendor} · {model.capabilityTier}</td>
              <td className='px-3 py-2.5'>{model.protocols.join(', ')}</td>
              <td className='px-3 py-2.5'>{model.verificationStatus}</td>
              <td className='px-3 py-2.5'>
                {model.activeProfileCount} active / {model.healthyProfileCount} healthy
              </td>
              <td className='px-3 py-2.5'>{model.independentProviderCount}</td>
              <td className='px-3 py-2.5'>
                {model.currentBestChannel || 'n/a'}
                <div className='text-muted-foreground'>{model.backupChannel || 'n/a'}</div>
              </td>
              <td className='px-3 py-2.5'>{model.currentMultiplier ?? 'n/a'}</td>
              <td className='px-3 py-2.5'>{model.autoRouteEnabled ? t('Enabled') : t('Disabled')}</td>
              <td className='px-3 py-2.5'>{model.exclusionReason || t('None')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MonitorTable(props: {
  profiles: ACUChannelMonitorProfile[]
  canPause: boolean
  onPause: (channel: string, duration: 30 | 120) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='max-w-full overflow-x-auto rounded border'>
      <table className='w-full min-w-[1180px] text-left text-xs'>
        <thead className='bg-muted/50'>
          <tr>
            {[
              'Model',
              'Protocol',
              'Provider / Channel',
              'Multiplier',
              'State',
              'Success',
              'Failures',
              'p50 / p95',
              'Last error',
              'Last success',
              'Cooldown',
              'Adaptive Probe',
              'Eligible',
              ...(props.canPause ? ['Actions'] : []),
            ].map((label) => (
              <th key={label} className='px-3 py-2 font-medium'>
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.profiles.map((profile) => (
            <tr key={profile.executionProfileId} className='border-t align-top'>
              <td className='px-3 py-2 font-medium'>
                {profile.canonicalModel}
              </td>
              <td className='px-3 py-2'>{profile.protocol.join(', ')}</td>
              <td className='px-3 py-2'>
                <div>{profile.provider}</div>
                <div className='text-muted-foreground'>{profile.channel}</div>
              </td>
              <td className='px-3 py-2'>{profile.multiplier || t('n/a')}</td>
              <td className='px-3 py-2'>
                <Badge variant={stateTone(profile.state)}>
                  {profile.state}
                </Badge>
              </td>
              <td className='px-3 py-2'>
                {((profile.recentSuccessRate ?? 0) * 100).toFixed(0)}%
              </td>
              <td className='px-3 py-2'>{profile.consecutiveFailures}</td>
              <td className='px-3 py-2'>
                {ms(profile.p50FirstModelEventLatencyMs)} /{' '}
                {ms(profile.p95FirstModelEventLatencyMs)}
              </td>
              <td
                className='max-w-40 truncate px-3 py-2'
                title={profile.lastError}
              >
                {profile.lastError || t('none')}
              </td>
              <td className='px-3 py-2'>
                {profile.lastSuccessAt
                  ? new Date(profile.lastSuccessAt).toLocaleString()
                  : t('n/a')}
              </td>
              <td className='px-3 py-2'>
                {profile.cooldownUntil
                  ? new Date(profile.cooldownUntil).toLocaleString()
                  : t('none')}
              </td>
              <td className='px-3 py-2'>
                <div>{profile.probeStatus || t('never')}</div>
                <div className='text-muted-foreground'>
                  {profile.probeFreshness} · {ms(profile.probeLatencyMs)} · ¥{Number(profile.probeCostCny || 0).toFixed(4)}
                </div>
                <div className='text-muted-foreground'>
                  {profile.lastProbeAt
                    ? new Date(profile.lastProbeAt).toLocaleString()
                    : t('n/a')} · today ¥{Number(profile.probeDailySpendCny || 0).toFixed(4)}
                </div>
              </td>
              <td className='px-3 py-2'>
                <Badge
                  variant={
                    profile.routingEligibility === 'eligible'
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {profile.routingEligibility ||
                    (profile.routingEligible ? 'eligible' : 'unavailable')}
                </Badge>
              </td>
              {props.canPause && (
                <td className='px-3 py-2'>
                  <div className='flex gap-1'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => props.onPause(profile.channel, 30)}
                    >
                      30m
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => props.onPause(profile.channel, 120)}
                    >
                      2h
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InventoryTable(props: { rows: Array<Record<string, unknown>> }) {
  const { t } = useTranslation()
  return (
    <div className='max-w-full overflow-x-auto rounded border'>
      <table className='w-full min-w-[900px] text-left text-xs'>
        <thead className='bg-muted/50'>
          <tr>
            {[
              'Provider',
              'Channel',
              'Endpoint',
              'Protocol candidates',
              'Models',
              'Verification',
              'Protocol verified',
              'Routing',
              'Profiles',
              'Rejection',
            ].map((label) => (
              <th key={label} className='px-3 py-2 font-medium'>
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => {
            const model = String(row.canonicalModel ?? '')
            const protocol = String(row.protocol ?? 'undetermined')
            return (
              <tr
                key={`${String(row.channelId ?? index)}:${model}:${protocol}`}
                className='border-t'
              >
                <td className='px-3 py-2'>{String(row.providerId ?? '')}</td>
                <td className='px-3 py-2 font-medium'>
                  {String(row.channelId ?? '')}
                </td>
                <td className='px-3 py-2'>{String(row.endpointHost ?? '')}</td>
                <td className='px-3 py-2'>{protocol}</td>
                <td className='max-w-96 px-3 py-2'>
                  {model || t('no canonical match')}
                </td>
                <td className='px-3 py-2'>
                  {String(row.discoveryStatus ?? 'not_discovered')} /{' '}
                  {row.modelListVerified ? t('verified') : t('unverified')}
                </td>
                <td className='px-3 py-2'>
                  {row.protocolVerified ? t('verified') : t('unverified')}
                </td>
                <td className='px-3 py-2'>
                  {String(row.verificationState ?? 'inventory_only')}
                </td>
                <td className='px-3 py-2'>
                  {Array.isArray(row.activeExecutionProfileIds)
                    ? row.activeExecutionProfileIds.join(', ')
                    : t('none')}
                </td>
                <td className='px-3 py-2'>
                  {String(row.rejectionReason ?? t('none'))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

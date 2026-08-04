import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  CircleOff,
  Clock3,
  Gauge,
  HeartPulse,
  Network,
  ShieldCheck,
  Table2,
  RefreshCw,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsAdmin } from '@/hooks/use-admin'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'

import {
  getACUChannelMonitor,
  getACUGlobalRoutingPolicy,
  updateACUGlobalRoutingPolicy,
  pauseACUChannel,
  type ACUChannelMonitorProfile,
  type ACUModelPoolEntry,
  type ACUProbeHistoryRow,
  type ACUMonitorRange,
} from '../api'
import { ACUChannelHistory } from './acu-channel-history'

function ms(value?: number) {
  if (!value) return 'n/a'
  return value < 1000
    ? `${Math.round(value)} ms`
    : `${(value / 1000).toFixed(1)} s`
}

function time(value?: string | null) {
  if (!value) return 'n/a'
  return new Date(value).toLocaleString()
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
  const isRoot = useAuthStore((state) => state.auth.user?.role === ROLE.SUPER_ADMIN)
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
  const policyQuery = useQuery({
    queryKey: ['acu-global-routing-policy'],
    queryFn: getACUGlobalRoutingPolicy,
    enabled: isRoot,
  })
  const [policyDraft, setPolicyDraft] = useState<typeof policyQuery.data>()
  const policy = policyDraft ?? policyQuery.data
  const policyMutation = useMutation({
    mutationFn: updateACUGlobalRoutingPolicy,
    onSuccess: () => {
      toast.success(t('ACU routing policy updated'))
      setPolicyDraft(undefined)
      void queryClient.invalidateQueries({ queryKey: ['acu-global-routing-policy'] })
    },
    onError: () => toast.error(t('ACU routing policy update failed')),
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
    eligible: allProfiles.filter((item) => item.routingEligible).length,
    models: new Set(allProfiles.map((item) => item.canonicalModel)).size,
    probes: query.data?.data?.probeHistory ?? [],
  }
  const statItems = [
    [t('Active Profiles'), summary.active, Activity],
    [t('Independent Providers'), summary.providers, Network],
    [t('Healthy'), summary.healthy, HeartPulse],
    [t('Degraded'), summary.degraded, Gauge],
    [t('Cooldown'), summary.cooldown, Clock3],
    [t('Disabled'), summary.disabled, CircleOff],
    [t('Route eligible'), summary.eligible, ShieldCheck],
    [t('Canonical models'), summary.models, Table2],
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
      {query.isError && (
        <div className='text-destructive flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 p-3 text-xs'>
          <AlertCircle className='mt-0.5 size-4 shrink-0' />
          <div>
            <div className='font-medium'>{t('Channel monitor data could not be loaded')}</div>
            <div className='mt-1'>{query.error instanceof Error ? query.error.message : t('Please refresh and try again')}</div>
          </div>
        </div>
      )}
      {query.isLoading && !query.data && (
        <div className='text-muted-foreground rounded border p-6 text-center text-xs'>
          {t('Loading channel inventory...')}
        </div>
      )}
      {isRoot && policy && (
        <section className='space-y-3 rounded border p-3'>
          <div>
            <h3 className='text-sm font-semibold'>{t('ACU Routing Policy')}</h3>
            <p className='text-muted-foreground text-xs'>{t('Global policy only narrows verified routing-eligible candidates.')}</p>
          </div>
          <div className='grid gap-3 lg:grid-cols-2'>
            <PolicyScopeEditor
              title={t('Allowed models')}
              allLabel={t('All routing-eligible models')}
              custom={policy.modelPolicy === 'custom_allowlist'}
              values={policy.allowedModelIds}
              options={[...new Set((query.data?.data?.modelPool ?? []).filter((item) => item.autoRouteEnabled).map((item) => item.modelId))].sort()}
              onCustom={(custom) => setPolicyDraft({ ...policy, modelPolicy: custom ? 'custom_allowlist' : 'all_routing_eligible' })}
              onChange={(values) => setPolicyDraft({ ...policy, allowedModelIds: values })}
            />
            <PolicyScopeEditor
              title={t('Allowed Profiles')}
              allLabel={t('All routing-eligible profiles')}
              custom={policy.profilePolicy === 'custom_allowlist'}
              values={policy.allowedProfileIds}
              options={(query.data?.data?.profiles ?? []).filter((item) => item.enabled && item.administratorAllowed && item.autoRouteEnabled).map((item) => item.executionProfileId).sort()}
              onCustom={(custom) => setPolicyDraft({ ...policy, profilePolicy: custom ? 'custom_allowlist' : 'all_routing_eligible' })}
              onChange={(values) => setPolicyDraft({ ...policy, allowedProfileIds: values })}
            />
          </div>
          <Button size='sm' disabled={policyMutation.isPending} onClick={() => policyMutation.mutate(policy)}>{t('Save policy')}</Button>
        </section>
      )}
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
      <Tabs defaultValue='overview' className='min-w-0'>
        <TabsList>
          <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
          <TabsTrigger value='current'>{t('Profiles')}</TabsTrigger>
          <TabsTrigger value='probes'>{t('Probe history')}</TabsTrigger>
          <TabsTrigger value='history'>{t('History')}</TabsTrigger>
          <TabsTrigger value='inventory'>{t('Supply inventory')}</TabsTrigger>
          <TabsTrigger value='models'>{t('Model pool')}</TabsTrigger>
        </TabsList>
        <TabsContent value='overview' className='min-w-0 space-y-3'>
          <CoverageTable rows={query.data?.data?.modelPool ?? []} />
          <div className='text-muted-foreground text-xs'>
            {t('Route eligible means the profile is configured, trusted, enabled and not in channel/profile cooldown. Probe status is independent and shows the latest recorded probe.')}
          </div>
        </TabsContent>
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
        <TabsContent value='probes' className='min-w-0'>
          <ProbeTable rows={summary.probes} />
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

function PolicyScopeEditor(props: {
  title: string
  allLabel: string
  custom: boolean
  values: string[]
  options: string[]
  onCustom: (custom: boolean) => void
  onChange: (values: string[]) => void
}) {
  return (
    <div className='space-y-2 rounded border p-2'>
      <label className='flex items-center gap-2 text-xs font-medium'>
        <input type='checkbox' checked={props.custom} onChange={(event) => props.onCustom(event.target.checked)} />
        {props.custom ? props.title : props.allLabel}
      </label>
      {props.custom && (
        <div className='max-h-40 space-y-1 overflow-y-auto'>
          {props.options.map((option) => (
            <label key={option} className='flex items-center gap-2 text-xs'>
              <input type='checkbox' checked={props.values.includes(option)} onChange={(event) => props.onChange(event.target.checked ? [...new Set([...props.values, option])].sort() : props.values.filter((value) => value !== option))} />
              <span className='font-mono'>{option}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function CoverageTable({ rows }: { rows: ACUModelPoolEntry[] }) {
  const { t } = useTranslation()
  return (
    <div className='max-w-full overflow-x-auto rounded border'>
      <table className='w-full min-w-[980px] text-left text-xs'>
        <thead className='bg-muted/50'>
          <tr>
            {['Model', 'Tier', 'Protocols', 'Configured profiles', 'Route eligible', 'Providers', 'Best channel', 'Latest probe'].map((label) => (
              <th key={label} className='px-3 py-2 font-medium'>{t(label)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((model) => {
            const latest = model.profiles
              .filter((profile) => profile.lastProbeAt)
              .sort((a, b) => new Date(b.lastProbeAt).getTime() - new Date(a.lastProbeAt).getTime())[0]
            const probePassed = model.profiles.filter((profile) => profile.probeStatus === 'success').length
            return (
              <tr key={model.modelId} className='border-t align-top'>
                <td className='px-3 py-2.5 font-medium'>{model.modelId}</td>
                <td className='px-3 py-2.5'>{model.capabilityTier}</td>
                <td className='px-3 py-2.5'>{model.protocols.join(', ') || 'n/a'}</td>
                <td className='px-3 py-2.5'>{model.activeProfileCount} active / {model.profiles.length} configured</td>
                <td className='px-3 py-2.5'>
                  <Badge variant={model.healthyProfileCount > 0 ? 'secondary' : 'outline'}>
                    {model.healthyProfileCount} / {model.activeProfileCount}
                  </Badge>
                </td>
                <td className='px-3 py-2.5'>{model.independentProviderCount}</td>
                <td className='px-3 py-2.5'>{model.currentBestChannel || t('none')}</td>
                <td className='px-3 py-2.5'>
                  <div>{probePassed} / {model.profiles.length} passed</div>
                  <div className='text-muted-foreground'>{latest ? `${latest.probeStatus} · ${time(latest.lastProbeAt)}` : t('never')}</div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProbeTable({ rows }: { rows: ACUProbeHistoryRow[] }) {
  const { t } = useTranslation()
  return (
    <div className='max-w-full overflow-x-auto rounded border'>
      <table className='w-full min-w-[1100px] text-left text-xs'>
        <thead className='bg-muted/50'>
          <tr>
            {['Started', 'Model', 'Protocol', 'Provider / Channel', 'Result', 'HTTP', 'Actual model', 'Usage', 'Latency', 'Cost', 'Error'].map((label) => (
              <th key={label} className='px-3 py-2 font-medium'>{t(label)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.execution_profile_id}:${row.started_at}:${row.channel_id}:${row.status}`} className='border-t align-top'>
              <td className='px-3 py-2'>{time(row.started_at)}</td>
              <td className='px-3 py-2 font-medium'>{row.canonical_model_id}</td>
              <td className='px-3 py-2'>{row.protocol}</td>
              <td className='px-3 py-2'><div>{row.provider_id}</div><div className='text-muted-foreground'>{row.channel_id}</div></td>
              <td className='px-3 py-2'><Badge variant={row.status === 'success' ? 'secondary' : 'destructive'}>{row.status}</Badge></td>
              <td className='px-3 py-2'>{row.http_status ?? 'n/a'}</td>
              <td className='px-3 py-2'>{row.actual_model || 'n/a'}</td>
              <td className='px-3 py-2'>{row.usage_trusted ? t('trusted') : t('untrusted')}</td>
              <td className='px-3 py-2'>{ms(row.latency_ms ?? undefined)}</td>
              <td className='px-3 py-2'>¥{Number(row.cost_cny || 0).toFixed(4)}</td>
              <td className='max-w-56 truncate px-3 py-2' title={row.error_class || ''}>{row.error_class || t('none')}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={11} className='text-muted-foreground px-3 py-8 text-center'>{t('No probe records in this range')}</td></tr>}
        </tbody>
      </table>
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
                <div className='text-muted-foreground mt-1 whitespace-nowrap'>
                  P {profile.profileStateRaw || profile.profileState} · C {profile.channelStateRaw || profile.channelState}
                </div>
                <div className='text-muted-foreground whitespace-nowrap'>
                  Provider {profile.providerStateRaw || 'unknown'} · Probe {profile.probeStateRaw || profile.probeFreshness}
                </div>
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
                <div className='text-muted-foreground mt-1 max-w-48'>
                  {profile.blockingScope ? `${profile.blockingScope}: ` : ''}
                  {profile.statusReason || profile.effectiveState}
                </div>
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

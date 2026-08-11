import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  Clock3,
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
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getACUChannelMonitor,
  getACUGlobalRoutingPolicy,
  getACURoutingUtilityConfig,
  updateACUGlobalRoutingPolicy,
  updateACURoutingUtilityConfig,
  pauseACUChannel,
  type ACUChannelMonitorProfile,
  type ACUModelPoolEntry,
  type ACUProbeHistoryRow,
  type ACUMonitorRange,
  type ACUMonitorScenario,
  type ACUSupplyStrategy,
  type ACUGlobalRoutingPolicy,
  type ACURoutingUtilityConfig,
} from '../api'
import { ACUChannelHealthCard } from './acu-channel-health-card'
import { groupACUChannels } from './acu-channel-health-model'
import { ACUChannelHistory } from './acu-channel-history'
import {
  filterProfilesByProtocol,
  monitorReason,
  monitorStateLabel,
  protocolLabel,
  sortMonitorProfiles,
  summarizeMonitorProfiles,
  type ACUMonitorProtocol,
  type ACUMonitorSort,
} from './acu-monitor-presentation'

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
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('overview')
  const [range, setRange] = useState<ACUMonitorRange>('24h')
  const [supplyStrategy, setSupplyStrategy] =
    useState<ACUSupplyStrategy>('balanced')
  const [scenario, setScenario] = useState<ACUMonitorScenario>('standard')
  const [protocol, setProtocol] = useState<ACUMonitorProtocol>('all')
  const [sort, setSort] = useState<ACUMonitorSort>('recommended')
  const [filters, setFilters] = useState({
    model: '',
    provider: '',
    protocol: '',
    state: '',
  })
  const query = useQuery({
    queryKey: ['acu-channel-monitor', range, supplyStrategy, scenario],
    queryFn: () => getACUChannelMonitor(range, supplyStrategy, scenario),
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
  const allProfiles = useMemo(
    () => query.data?.data?.profiles ?? [],
    [query.data?.data?.profiles]
  )
  const protocolProfiles = useMemo(
    () => filterProfilesByProtocol(allProfiles, protocol),
    [allProfiles, protocol]
  )
  const profiles = useMemo(
    () =>
      sortMonitorProfiles(
        protocolProfiles.filter(
          (profile) =>
            (!filters.model || profile.canonicalModel === filters.model) &&
            (!filters.provider || profile.provider === filters.provider) &&
            (!filters.protocol ||
              profile.protocol.includes(filters.protocol)) &&
            (!filters.state || profile.state === filters.state)
        ),
        sort
      ),
    [filters, protocolProfiles, sort]
  )
  const channelGroups = useMemo(
    () =>
      groupACUChannels(
        protocolProfiles,
        query.data?.data?.history ?? [],
        range,
        query.data?.data?.generatedAt,
        query.data?.data?.probeHistory ?? []
      ),
    [protocolProfiles, query.data, range]
  )
  const summary = summarizeMonitorProfiles(protocolProfiles)
  const statItems = [
    [t('Configured'), summary.configured, Activity],
    [t('Currently available'), summary.eligible, HeartPulse],
    [t('Cooling down or recovering'), summary.recovering, Clock3],
    [t('Independent available channels'), summary.channels, Network],
    [t('Available models'), summary.models, ShieldCheck],
    [t('Production requests in range'), summary.requests, Table2],
  ] as const
  return (
    <div className='flex h-full min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-base font-semibold'>
            {t('Model Supply Monitor')}
          </h2>
          <p className='text-muted-foreground text-xs'>
            {t(
              'View model supply availability, automatic recovery status, and verified inventory.'
            )}
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
      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
        <label className='space-y-1 text-xs'>
          <span className='text-muted-foreground'>{t('Time range')}</span>
          <select
            aria-label={t('Time range')}
            className='bg-background h-8 w-full rounded border px-2'
            value={range}
            onChange={(event) =>
              setRange(event.target.value as ACUMonitorRange)
            }
          >
            <option value='1h'>1h</option>
            <option value='6h'>6h</option>
            <option value='24h'>24h</option>
            <option value='7d'>7d</option>
          </select>
        </label>
        <label className='space-y-1 text-xs'>
          <span className='text-muted-foreground'>{t('Scoring strategy')}</span>
          <select
            aria-label={t('Scoring strategy')}
            className='bg-background h-8 w-full rounded border px-2'
            value={supplyStrategy}
            onChange={(event) =>
              setSupplyStrategy(event.target.value as ACUSupplyStrategy)
            }
          >
            <option value='balanced'>{t('Balanced')}</option>
            <option value='lowest_cost'>{t('Lowest cost')}</option>
            <option value='low_latency'>{t('Low latency')}</option>
            <option value='high_reliability'>{t('High reliability')}</option>
          </select>
        </label>
        <label className='space-y-1 text-xs'>
          <span className='text-muted-foreground'>{t('Request size')}</span>
          <select
            aria-label={t('Request size')}
            className='bg-background h-8 w-full rounded border px-2'
            value={scenario}
            onChange={(event) =>
              setScenario(event.target.value as ACUMonitorScenario)
            }
          >
            <option value='small'>{t('Small 2k/500')}</option>
            <option value='standard'>{t('Standard 20k/2k')}</option>
            <option value='long'>{t('Long context 100k/4k')}</option>
          </select>
        </label>
        <label className='space-y-1 text-xs'>
          <span className='text-muted-foreground'>{t('Protocol')}</span>
          <select
            aria-label={t('Protocol')}
            className='bg-background h-8 w-full rounded border px-2'
            value={protocol}
            onChange={(event) =>
              setProtocol(event.target.value as ACUMonitorProtocol)
            }
          >
            <option value='all'>{t('All protocols')}</option>
            <option value='responses'>{t('OpenAI Responses (Codex)')}</option>
            <option value='messages'>
              {t('Anthropic Messages (Claude protocol)')}
            </option>
          </select>
        </label>
        <label className='space-y-1 text-xs'>
          <span className='text-muted-foreground'>{t('Sort')}</span>
          <select
            aria-label={t('Sort')}
            className='bg-background h-8 w-full rounded border px-2'
            value={sort}
            onChange={(event) => setSort(event.target.value as ACUMonitorSort)}
          >
            <option value='recommended'>{t('Recommended')}</option>
            <option value='usage'>{t('Usage high to low')}</option>
            <option value='cost'>{t('Estimated cost low to high')}</option>
            <option value='reliability'>{t('Reliability high to low')}</option>
            <option value='speed'>{t('Response speed fast to slow')}</option>
            <option value='recent_issue'>{t('Most recent issue')}</option>
          </select>
        </label>
      </div>
      <div className='bg-muted/40 text-muted-foreground rounded border px-3 py-2 text-xs'>
        {t(
          'Route eligible means this Profile can currently take production requests. A fresh Probe only means a recent check ran; it does not mean the check passed.'
        )}
        {protocol === 'messages' &&
        summary.channels === 1 &&
        summary.eligible > 0 ? (
          <div className='text-foreground mt-1 font-medium'>
            {t(
              'Currently available Anthropic Messages supply is concentrated in one independent channel.'
            )}
          </div>
        ) : null}
      </div>
      {query.isError && (
        <div className='text-destructive border-destructive/30 bg-destructive/5 flex items-start gap-2 rounded border p-3 text-xs'>
          <AlertCircle className='mt-0.5 size-4 shrink-0' />
          <div>
            <div className='font-medium'>
              {t('Channel monitor data could not be loaded')}
            </div>
            <div className='mt-1'>
              {query.error instanceof Error
                ? query.error.message
                : t('Please refresh and try again')}
            </div>
          </div>
        </div>
      )}
      {query.isLoading && !query.data && (
        <div className='text-muted-foreground rounded border p-6 text-center text-xs'>
          {t('Loading channel inventory...')}
        </div>
      )}
      <div className='bg-border grid grid-cols-2 gap-px overflow-hidden rounded border lg:grid-cols-6'>
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className='min-w-0'>
        <TabsList>
          <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
          <TabsTrigger value='current'>{t('Profiles')}</TabsTrigger>
          <TabsTrigger value='probes'>{t('Probe history')}</TabsTrigger>
          <TabsTrigger value='history'>{t('History')}</TabsTrigger>
          <TabsTrigger value='inventory'>{t('Supply inventory')}</TabsTrigger>
          <TabsTrigger value='models'>{t('Model pool')}</TabsTrigger>
          {isRoot && (
            <TabsTrigger value='routing'>
              {t('Router configuration')}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value='overview' className='min-w-0 space-y-3'>
          <div className='grid min-w-0 gap-3 xl:grid-cols-2'>
            {channelGroups.map((channel) => (
              <ACUChannelHealthCard
                key={channel.channel}
                channel={channel}
                generatedAt={query.data?.data?.generatedAt ?? ''}
              />
            ))}
          </div>
          {channelGroups.length === 0 && !query.isLoading && (
            <div className='text-muted-foreground rounded border p-8 text-center text-xs'>
              {t('No Channel profiles')}
            </div>
          )}
          <div className='text-muted-foreground text-xs'>
            {t(
              'Route eligible means the profile is configured, trusted, enabled and not in channel/profile cooldown. Probe status is independent and shows the latest recorded probe.'
            )}
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
                  {[...new Set(profileFilterValues(protocolProfiles, key))]
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
          <ProbeTable
            rows={(query.data?.data?.probeHistory ?? []).filter(
              (row) => protocol === 'all' || row.protocol === protocol
            )}
          />
        </TabsContent>
        <TabsContent value='history' className='min-w-0 space-y-3'>
          <ACUChannelHistory
            range={range}
            onRangeChange={setRange}
            profiles={protocolProfiles}
            rows={query.data?.data?.history ?? []}
            cooldownIntervals={query.data?.data?.cooldownIntervals ?? []}
          />
        </TabsContent>
        <TabsContent value='inventory' className='min-w-0'>
          <InventoryTable
            rows={(query.data?.data?.supplyInventory ?? []).filter(
              (row) => protocol === 'all' || row.protocol === protocol
            )}
          />
        </TabsContent>
        <TabsContent value='models' className='min-w-0'>
          <ModelPoolTable
            rows={(query.data?.data?.modelPool ?? []).filter(
              (model) =>
                protocol === 'all' || model.protocols.includes(protocol)
            )}
          />
        </TabsContent>
        {isRoot && (
          <TabsContent value='routing' className='min-w-0'>
            {activeTab === 'routing' && (
              <RouterConfigurationTab
                modelPool={query.data?.data?.modelPool ?? []}
                profiles={query.data?.data?.profiles ?? []}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function RouterConfigurationTab(props: {
  modelPool: ACUModelPoolEntry[]
  profiles: ACUChannelMonitorProfile[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const policyQuery = useQuery({
    queryKey: ['acu-global-routing-policy'],
    queryFn: getACUGlobalRoutingPolicy,
  })
  const utilityQuery = useQuery({
    queryKey: ['acu-routing-utility-config'],
    queryFn: getACURoutingUtilityConfig,
  })
  const savedPolicy = policyQuery.data
  const savedUtilityConfig = utilityQuery.data
  const [editing, setEditing] = useState(false)
  const [policyDraft, setPolicyDraft] = useState<ACUGlobalRoutingPolicy>()
  const [utilityDraft, setUtilityDraft] = useState<ACURoutingUtilityConfig>()
  const refetchSavedConfiguration = async () => {
    await Promise.all([
      queryClient.refetchQueries({
        queryKey: ['acu-global-routing-policy'],
      }),
      queryClient.refetchQueries({
        queryKey: ['acu-routing-utility-config'],
      }),
    ])
  }
  const saveMutation = useMutation({
    mutationFn: async (input: {
      policy: ACUGlobalRoutingPolicy
      utilityConfig: ACURoutingUtilityConfig
    }) => {
      let policySaved = false
      await updateACUGlobalRoutingPolicy(input.policy)
      policySaved = true
      try {
        await updateACURoutingUtilityConfig(input.utilityConfig)
      } catch (error) {
        const saveError =
          error instanceof Error ? error : new Error(String(error))
        Object.assign(saveError, { partialUpdate: policySaved })
        throw saveError
      }
    },
    onSuccess: async () => {
      await refetchSavedConfiguration()
      await queryClient.invalidateQueries({ queryKey: ['acu-model-pool'] })
      setPolicyDraft(undefined)
      setUtilityDraft(undefined)
      setEditing(false)
      toast.success(t('ACU Router configuration updated'))
    },
    onError: async (error) => {
      await refetchSavedConfiguration()
      const partialUpdate =
        error instanceof Error &&
        (error as Error & { partialUpdate?: boolean }).partialUpdate
      toast.error(
        t(
          partialUpdate
            ? 'ACU Router configuration partially updated; current server configuration reloaded'
            : 'ACU Router configuration update failed; current server configuration reloaded'
        )
      )
    },
  })
  const beginEditing = () => {
    if (!savedPolicy || !savedUtilityConfig) return
    setPolicyDraft(structuredClone(savedPolicy))
    setUtilityDraft(structuredClone(savedUtilityConfig))
    setEditing(true)
  }
  const cancelEditing = () => {
    setPolicyDraft(undefined)
    setUtilityDraft(undefined)
    setEditing(false)
  }
  const availableModelIds = useMemo(
    () =>
      new Set(
        props.modelPool
          .filter((item) => item.autoRouteEnabled)
          .map((item) => item.modelId)
      ),
    [props.modelPool]
  )
  const availableProfileIds = useMemo(
    () =>
      new Set(
        props.profiles
          .filter(
            (item) =>
              item.enabled && item.administratorAllowed && item.autoRouteEnabled
          )
          .map((item) => item.executionProfileId)
      ),
    [props.profiles]
  )
  const availableModelIdList = useMemo(
    () => [...availableModelIds].sort(),
    [availableModelIds]
  )
  const availableProfileIdList = useMemo(
    () => [...availableProfileIds].sort(),
    [availableProfileIds]
  )
  const profileById = useMemo(
    () =>
      new Map(
        props.profiles.map((profile) => [profile.executionProfileId, profile])
      ),
    [props.profiles]
  )
  const editingPolicy = policyDraft ?? savedPolicy
  const modelOptions = useMemo(
    () =>
      editingPolicy
        ? [...new Set([...editingPolicy.allowedModelIds, ...availableModelIds])]
            .sort()
            .map((id) => ({ id, unavailable: !availableModelIds.has(id) }))
        : [],
    [availableModelIds, editingPolicy]
  )
  const profileOptions = useMemo(() => {
    if (!editingPolicy) return []
    const allowedModelIds = new Set(editingPolicy.allowedModelIds)
    return [
      ...new Set([...editingPolicy.allowedProfileIds, ...availableProfileIds]),
    ]
      .sort()
      .map((id) => {
        const profile = profileById.get(id)
        const outsideModelAllowlist =
          editingPolicy.modelPolicy === 'custom_allowlist' &&
          profile &&
          !allowedModelIds.has(profile.canonicalModel)
        return {
          id,
          unavailable: !availableProfileIds.has(id),
          disabled:
            outsideModelAllowlist &&
            !editingPolicy.allowedProfileIds.includes(id),
          disabledReason: outsideModelAllowlist
            ? t('outside current model allowlist')
            : undefined,
        }
      })
  }, [availableProfileIds, editingPolicy, profileById, t])
  const ids = (values: string[]) =>
    values.length ? values.join(', ') : t('None')
  const scopeSummary = (
    mode: 'all_routing_eligible' | 'custom_allowlist',
    values: string[],
    allLabel: string,
    noun: string,
    availableValues: string[] = []
  ) => {
    if (mode === 'all_routing_eligible') {
      return `${allLabel} · ${t('No custom exclusions')}`
    }
    const excludedValues = availableValues.filter(
      (value) => !values.includes(value)
    )
    const excludedSummary = excludedValues.length
      ? ` · ${t('Excluded')}: ${ids(excludedValues)}`
      : ''
    return `${noun} · ${values.length} · ${ids(values)}${excludedSummary}`
  }
  const beginModelCustomPolicy = (custom: boolean) => {
    if (!policyDraft) return
    const allowedModelIds =
      custom && policyDraft.allowedModelIds.length === 0
        ? availableModelIdList
        : policyDraft.allowedModelIds
    const allowedModels = new Set(allowedModelIds)
    const allowedProfileIds =
      custom && policyDraft.profilePolicy === 'custom_allowlist'
        ? policyDraft.allowedProfileIds.filter((profileId) => {
            const modelId = profileById.get(profileId)?.canonicalModel
            return !modelId || allowedModels.has(modelId)
          })
        : policyDraft.allowedProfileIds
    setPolicyDraft({
      ...policyDraft,
      modelPolicy: custom ? 'custom_allowlist' : 'all_routing_eligible',
      allowedModelIds,
      allowedProfileIds,
    })
  }
  const beginProfileCustomPolicy = (custom: boolean) => {
    if (!policyDraft) return
    const selectedModelIds = new Set(policyDraft.allowedModelIds)
    const selectableProfileIds = availableProfileIdList.filter((profileId) => {
      if (policyDraft.modelPolicy !== 'custom_allowlist') return true
      const modelId = profileById.get(profileId)?.canonicalModel
      return !modelId || selectedModelIds.has(modelId)
    })
    const allowedProfileIds =
      custom && policyDraft.allowedProfileIds.length === 0
        ? selectableProfileIds
        : policyDraft.allowedProfileIds
    setPolicyDraft({
      ...policyDraft,
      profilePolicy: custom ? 'custom_allowlist' : 'all_routing_eligible',
      allowedProfileIds,
    })
  }
  const changeAllowedModels = (values: string[]) => {
    if (!policyDraft) return
    const allowedModels = new Set(values)
    const allowedProfileIds =
      policyDraft.profilePolicy === 'custom_allowlist'
        ? policyDraft.allowedProfileIds.filter((profileId) => {
            const modelId = profileById.get(profileId)?.canonicalModel
            return !modelId || allowedModels.has(modelId)
          })
        : policyDraft.allowedProfileIds
    setPolicyDraft({
      ...policyDraft,
      allowedModelIds: values,
      allowedProfileIds,
    })
  }
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='text-sm font-semibold'>
            {t('Current saved global configuration')}
          </h3>
          <p className='text-muted-foreground text-xs'>
            {t(
              'This section reflects the latest configuration fetched from the server.'
            )}
          </p>
        </div>
        <Button
          size='sm'
          variant='outline'
          onClick={editing ? cancelEditing : beginEditing}
        >
          {editing ? t('Discard changes') : t('Edit configuration')}
        </Button>
      </div>
      {(policyQuery.isLoading || utilityQuery.isLoading) && (
        <div className='text-muted-foreground rounded border p-4 text-xs'>
          {t('Loading saved Router configuration...')}
        </div>
      )}
      {!policyQuery.isLoading &&
        !utilityQuery.isLoading &&
        savedPolicy &&
        savedUtilityConfig && (
          <section className='space-y-3 rounded border p-3 text-xs'>
            <div>
              <span className='text-muted-foreground'>{t('Formula')}: </span>
              <span className='font-medium'>
                {savedUtilityConfig.formulaMode}
              </span>
            </div>
            <div>
              <div className='text-muted-foreground'>
                {t('Global model policy')}
              </div>
              <div className='mt-1'>
                {scopeSummary(
                  savedPolicy.modelPolicy,
                  savedPolicy.allowedModelIds,
                  t('All routing-eligible models'),
                  t('Custom allowlist'),
                  availableModelIdList
                )}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground'>
                {t('Global profile policy')}
              </div>
              <div className='mt-1'>
                {scopeSummary(
                  savedPolicy.profilePolicy,
                  savedPolicy.allowedProfileIds,
                  t('All routing-eligible profiles'),
                  t('Custom allowlist'),
                  availableProfileIdList
                )}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground'>
                {t('Default candidate preferences')}
              </div>
              <div className='mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2'>
                {Object.entries(
                  savedUtilityConfig.defaultCandidatePreferenceScores
                ).map(([candidateId, score]) => (
                  <div key={candidateId} className='flex justify-between gap-3'>
                    <span className='truncate font-mono'>{candidateId}</span>
                    <span>{score}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground'>
                {t('Quality presets')}
              </div>
              <div className='mt-1 flex flex-wrap gap-x-4 gap-y-1'>
                {Object.entries(savedUtilityConfig.qualityPresets).map(
                  ([name, value]) => (
                    <span key={name}>
                      {name}: {value}
                    </span>
                  )
                )}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground'>
                {t('Supply strategy presets')}
              </div>
              <div className='mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2'>
                {Object.entries(savedUtilityConfig.supplyPresets).map(
                  ([name, weights]) => (
                    <span key={name}>
                      {name}: {weights.cost}/{weights.speed}/
                      {weights.reliability}
                    </span>
                  )
                )}
              </div>
            </div>
          </section>
        )}
      {!policyQuery.isLoading &&
        !utilityQuery.isLoading &&
        (!savedPolicy || !savedUtilityConfig) && (
          <div className='text-destructive rounded border p-4 text-xs'>
            {t('Saved Router configuration could not be loaded.')}
          </div>
        )}
      {editing && policyDraft && utilityDraft && (
        <section className='space-y-3 rounded border p-3'>
          <h3 className='text-sm font-semibold'>
            {t('Edit global Router configuration')}
          </h3>
          <PolicyScopeEditor
            title={t('Allowed models')}
            allLabel={t('All routing-eligible models')}
            custom={policyDraft.modelPolicy === 'custom_allowlist'}
            values={policyDraft.allowedModelIds}
            options={modelOptions}
            onCustom={beginModelCustomPolicy}
            onChange={changeAllowedModels}
          />
          <PolicyScopeEditor
            title={t('Allowed profiles')}
            allLabel={t('All routing-eligible profiles')}
            custom={policyDraft.profilePolicy === 'custom_allowlist'}
            values={policyDraft.allowedProfileIds}
            options={profileOptions}
            onCustom={beginProfileCustomPolicy}
            onChange={(values) =>
              setPolicyDraft({ ...policyDraft, allowedProfileIds: values })
            }
          />
          <RoutingUtilityEditor
            value={utilityDraft}
            modelPool={props.modelPool}
            onChange={setUtilityDraft}
          />
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              disabled={saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate({
                  policy: policyDraft,
                  utilityConfig: utilityDraft,
                })
              }
            >
              {t('Save configuration')}
            </Button>
            <Button size='sm' variant='outline' onClick={cancelEditing}>
              {t('Discard changes')}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function RoutingUtilityEditor(props: {
  value: ACURoutingUtilityConfig
  modelPool: ACUModelPoolEntry[]
  onChange: (value: ACURoutingUtilityConfig) => void
}) {
  const { t } = useTranslation()
  const [candidatePreferencesOpen, setCandidatePreferencesOpen] =
    useState(false)
  const candidateGroups = useMemo(() => {
    const groups = props.modelPool
      .filter(
        (model) =>
          model.modelCategory === 'text_agent' &&
          model.autoRouteEnabled &&
          ['verified', 'verified_provisional'].includes(
            model.verificationStatus
          )
      )
      .map((model) => ({
        modelId: model.modelId,
        candidates: model.routingCandidates?.length
          ? model.routingCandidates
          : [
              {
                candidateId: model.modelId,
                modelId: model.modelId,
                displayName: model.modelId,
                kind: 'base' as const,
                protocols: [] as Array<'responses' | 'messages'>,
                responsesProfileCount: 0,
                messagesProfileCount: 0,
              },
            ],
      }))
    const represented = new Set(
      groups.flatMap((group) =>
        group.candidates.map((candidate) => candidate.candidateId)
      )
    )
    for (const candidateId of Object.keys(
      props.value.defaultCandidatePreferenceScores
    )) {
      if (represented.has(candidateId)) continue
      groups.push({
        modelId: candidateId,
        candidates: [
          {
            candidateId,
            modelId: candidateId.split('@')[0],
            displayName: candidateId,
            kind: 'base' as const,
            protocols: [] as Array<'responses' | 'messages'>,
            responsesProfileCount: 0,
            messagesProfileCount: 0,
          },
        ],
      })
    }
    return groups
      .filter((group) => group.candidates.length > 0)
      .sort((left, right) => left.modelId.localeCompare(right.modelId))
  }, [props.modelPool, props.value.defaultCandidatePreferenceScores])
  const numberField = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    min: number,
    max: number,
    step = 1
  ) => (
    <label className='space-y-1 text-xs'>
      <span className='text-muted-foreground'>{t(label)}</span>
      <input
        className='bg-background h-8 w-full rounded-md border px-2'
        type='number'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
  return (
    <details className='rounded border p-3'>
      <summary className='cursor-pointer text-sm font-semibold'>
        {t('ACU Routing Utility')}
      </summary>
      <div className='mt-3 space-y-4'>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <label className='space-y-1 text-xs'>
            <span className='text-muted-foreground'>{t('Formula mode')}</span>
            <select
              className='bg-background h-8 w-full rounded-md border px-2'
              value={props.value.formulaMode}
              onChange={(event) =>
                props.onChange({
                  ...props.value,
                  formulaMode: event.target
                    .value as ACURoutingUtilityConfig['formulaMode'],
                })
              }
            >
              <option value='legacy'>legacy</option>
              <option value='shadow'>shadow</option>
              <option value='active'>active</option>
            </select>
          </label>
          {(['economy', 'balanced', 'quality'] as const).map((preset) =>
            numberField(
              `${preset} quality bias`,
              props.value.qualityPresets[preset],
              (value) =>
                props.onChange({
                  ...props.value,
                  qualityPresets: {
                    ...props.value.qualityPresets,
                    [preset]: value,
                  },
                }),
              -100,
              100
            )
          )}
          {numberField(
            'acu-high bias offset',
            props.value.acuHighBiasOffset,
            (value) =>
              props.onChange({ ...props.value, acuHighBiasOffset: value }),
            0,
            100
          )}
          {numberField(
            'Model cost log scale',
            props.value.modelCostLogScale,
            (value) =>
              props.onChange({ ...props.value, modelCostLogScale: value }),
            0.1,
            20,
            0.1
          )}
          {numberField(
            'Profile cost log scale',
            props.value.profileCostLogScale,
            (value) =>
              props.onChange({ ...props.value, profileCostLogScale: value }),
            0.1,
            20,
            0.1
          )}
          {numberField(
            'Profile speed log scale',
            props.value.profileSpeedLogScale,
            (value) =>
              props.onChange({ ...props.value, profileSpeedLogScale: value }),
            0.1,
            20,
            0.1
          )}
        </div>
        <div className='grid gap-3 lg:grid-cols-2'>
          {(
            Object.keys(props.value.supplyPresets) as Array<
              keyof typeof props.value.supplyPresets
            >
          ).map((preset) => (
            <div key={preset} className='rounded border p-2'>
              <div className='mb-2 text-xs font-medium'>{t(preset)}</div>
              <div className='grid grid-cols-3 gap-2'>
                {(['cost', 'speed', 'reliability'] as const).map((dimension) =>
                  numberField(
                    dimension,
                    props.value.supplyPresets[preset][dimension],
                    (value) =>
                      props.onChange({
                        ...props.value,
                        supplyPresets: {
                          ...props.value.supplyPresets,
                          [preset]: {
                            ...props.value.supplyPresets[preset],
                            [dimension]: value,
                          },
                        },
                      }),
                    0,
                    100
                  )
                )}
              </div>
            </div>
          ))}
        </div>
        <div className='rounded border p-2'>
          <Button
            size='sm'
            variant='ghost'
            aria-expanded={candidatePreferencesOpen}
            onClick={() => setCandidatePreferencesOpen((open) => !open)}
          >
            {t('Default candidate preferences')}
          </Button>
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'These defaults apply when an API key has no candidate-specific override. API key allowlists remain hard constraints.'
            )}
          </p>
          {candidatePreferencesOpen && (
            <div className='mt-3 grid max-h-96 gap-3 overflow-y-auto pr-1 md:grid-cols-2'>
              {candidateGroups.map((group) => (
                <div
                  key={group.modelId}
                  className='space-y-1 rounded border p-2'
                >
                  <div className='truncate text-xs font-medium'>
                    {group.candidates.find(
                      (candidate) => candidate.kind === 'base'
                    )?.displayName ?? group.modelId}
                  </div>
                  {group.candidates.map((candidate) => {
                    let label = candidate.displayName
                    if (candidate.kind === 'base') {
                      label = t('Standard')
                    } else if (candidate.reasoningEffort) {
                      label = candidate.reasoningEffort
                    }
                    return (
                      <label
                        key={candidate.candidateId}
                        className='grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 text-xs'
                      >
                        <span
                          className='truncate'
                          title={candidate.candidateId}
                        >
                          {label}
                        </span>
                        <input
                          aria-label={`${candidate.candidateId} ${t('Default candidate preference')}`}
                          className='bg-background h-8 w-full rounded-md border px-2'
                          type='number'
                          min={0}
                          max={200}
                          step={0.1}
                          value={
                            props.value.defaultCandidatePreferenceScores[
                              candidate.candidateId
                            ] ?? 100
                          }
                          onChange={(event) => {
                            const score = event.target.valueAsNumber
                            const next = {
                              ...props.value.defaultCandidatePreferenceScores,
                            }
                            if (!Number.isFinite(score) || score === 100) {
                              delete next[candidate.candidateId]
                            } else {
                              next[candidate.candidateId] = score
                            }
                            props.onChange({
                              ...props.value,
                              defaultCandidatePreferenceScores: next,
                            })
                          }}
                        />
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        <details className='rounded border p-2'>
          <summary className='cursor-pointer text-xs font-medium'>
            {t('Latency and reliability')}
          </summary>
          <div className='mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            {numberField(
              'Latency window hours',
              props.value.latency.windowHours,
              (value) =>
                props.onChange({
                  ...props.value,
                  latency: { ...props.value.latency, windowHours: value },
                }),
              1,
              168
            )}
            {numberField(
              'Long context threshold',
              props.value.latency.longContextThresholdTokens,
              (value) =>
                props.onChange({
                  ...props.value,
                  latency: {
                    ...props.value.latency,
                    longContextThresholdTokens: value,
                  },
                }),
              1,
              1000000
            )}
            {numberField(
              'Latency minimum samples',
              props.value.latency.minimumSamples,
              (value) =>
                props.onChange({
                  ...props.value,
                  latency: { ...props.value.latency, minimumSamples: value },
                }),
              3,
              1000
            )}
            {numberField(
              'Unknown latency multiplier',
              props.value.latency.unknownLatencyMultiplier,
              (value) =>
                props.onChange({
                  ...props.value,
                  latency: {
                    ...props.value.latency,
                    unknownLatencyMultiplier: value,
                  },
                }),
              1,
              5,
              0.1
            )}
            {numberField(
              'Reliability window hours',
              props.value.reliability.windowHours,
              (value) =>
                props.onChange({
                  ...props.value,
                  reliability: {
                    ...props.value.reliability,
                    windowHours: value,
                  },
                }),
              1,
              168
            )}
            {numberField(
              'Reliability minimum samples',
              props.value.reliability.minimumSamples,
              (value) =>
                props.onChange({
                  ...props.value,
                  reliability: {
                    ...props.value.reliability,
                    minimumSamples: value,
                  },
                }),
              3,
              1000
            )}
            {numberField(
              'Unknown reliability default',
              props.value.reliability.unknownDefault,
              (value) =>
                props.onChange({
                  ...props.value,
                  reliability: {
                    ...props.value.reliability,
                    unknownDefault: value,
                  },
                }),
              0.5,
              0.95,
              0.01
            )}
            {numberField(
              'Degraded reliability multiplier',
              props.value.reliability.degradedMultiplier,
              (value) =>
                props.onChange({
                  ...props.value,
                  reliability: {
                    ...props.value.reliability,
                    degradedMultiplier: value,
                  },
                }),
              0.5,
              1,
              0.01
            )}
          </div>
        </details>
      </div>
    </details>
  )
}

function PolicyScopeEditor(props: {
  title: string
  allLabel: string
  custom: boolean
  values: string[]
  options: Array<{
    id: string
    unavailable: boolean
    disabled?: boolean
    disabledReason?: string
  }>
  onCustom: (custom: boolean) => void
  onChange: (values: string[]) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-2 rounded border p-2'>
      <label className='flex items-center gap-2 text-xs font-medium'>
        <input
          type='checkbox'
          checked={props.custom}
          onChange={(event) => props.onCustom(event.target.checked)}
        />
        {props.custom ? props.title : props.allLabel}
      </label>
      {props.custom && (
        <>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Custom mode starts with all currently routing-eligible entries selected. Uncheck entries to exclude them.'
            )}
          </p>
          <div className='max-h-64 space-y-1 overflow-y-auto'>
            {props.options.map((option) => {
              let suffix = ''
              if (option.unavailable) {
                suffix = ` · ${t('currently unavailable')}`
              } else if (option.disabledReason) {
                suffix = ` · ${t(option.disabledReason)}`
              }
              return (
                <label
                  key={option.id}
                  className='flex items-center gap-2 text-xs'
                >
                  <input
                    type='checkbox'
                    disabled={option.disabled}
                    checked={props.values.includes(option.id)}
                    onChange={(event) =>
                      props.onChange(
                        event.target.checked
                          ? [...new Set([...props.values, option.id])].sort()
                          : props.values.filter((value) => value !== option.id)
                      )
                    }
                  />
                  <span
                    className='font-mono'
                    title={option.disabledReason || undefined}
                  >
                    {option.id}
                    {suffix}
                  </span>
                </label>
              )
            })}
          </div>
        </>
      )}
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
            {[
              'Started',
              'Model',
              'Protocol',
              'Provider / Channel',
              'Result',
              'HTTP',
              'Actual model',
              'Usage',
              'Latency',
              'Cost',
              'Error',
            ].map((label) => (
              <th key={label} className='px-3 py-2 font-medium'>
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.execution_profile_id}:${row.started_at}:${row.channel_id}:${row.status}`}
              className='border-t align-top'
            >
              <td className='px-3 py-2'>{time(row.started_at)}</td>
              <td className='px-3 py-2 font-medium'>
                {row.canonical_model_id}
              </td>
              <td className='px-3 py-2'>{protocolLabel(row.protocol, t)}</td>
              <td className='px-3 py-2'>
                <div>{row.provider_id}</div>
                <div className='text-muted-foreground'>{row.channel_id}</div>
              </td>
              <td className='px-3 py-2'>
                <Badge
                  variant={
                    row.status === 'success' ? 'secondary' : 'destructive'
                  }
                >
                  {monitorStateLabel(row.status, t)}
                </Badge>
              </td>
              <td className='px-3 py-2'>{row.http_status ?? 'n/a'}</td>
              <td className='px-3 py-2'>{row.actual_model || 'n/a'}</td>
              <td className='px-3 py-2'>
                {row.usage_trusted ? t('trusted') : t('untrusted')}
              </td>
              <td className='px-3 py-2'>{ms(row.latency_ms ?? undefined)}</td>
              <td className='px-3 py-2'>
                ¥{Number(row.cost_cny || 0).toFixed(4)}
              </td>
              <td
                className='max-w-56 truncate px-3 py-2'
                title={row.error_class || ''}
              >
                {row.error_class || t('none')}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={11}
                className='text-muted-foreground px-3 py-8 text-center'
              >
                {t('No probe records in this range')}
              </td>
            </tr>
          )}
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
              <th key={label} className='px-3 py-2 font-medium'>
                {t(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((model) => (
            <tr key={model.modelId} className='border-t align-top'>
              <td className='px-3 py-2.5'>
                <details>
                  <summary className='cursor-pointer font-medium'>
                    {model.modelId}
                  </summary>
                  <div className='text-muted-foreground mt-2 space-y-1 pl-3'>
                    {model.profiles.map((profile) => (
                      <div key={profile.executionProfileId}>
                        {profile.provider} · {profile.channel} ·{' '}
                        {monitorStateLabel(profile.routingEligibility, t)}
                        {profile.requiresFreshProbe && (
                          <>
                            {' '}
                            · {t('Probe')}{' '}
                            {monitorStateLabel(profile.probeFreshness, t)} /{' '}
                            {monitorStateLabel(
                              profile.probeStatus || 'none',
                              t
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              </td>
              <td className='px-3 py-2.5'>
                {model.vendor} · {model.capabilityTier}
              </td>
              <td className='px-3 py-2.5'>
                {model.protocols
                  .map((value) => protocolLabel(value, t))
                  .join(', ')}
              </td>
              <td className='px-3 py-2.5'>
                {monitorStateLabel(model.verificationStatus, t)}
              </td>
              <td className='px-3 py-2.5'>
                {model.activeProfileCount} active / {model.healthyProfileCount}{' '}
                healthy
              </td>
              <td className='px-3 py-2.5'>{model.independentProviderCount}</td>
              <td className='px-3 py-2.5'>
                {model.currentBestChannel || 'n/a'}
                <div className='text-muted-foreground'>
                  {model.backupChannel || 'n/a'}
                </div>
              </td>
              <td className='px-3 py-2.5'>
                {model.currentMultiplier ?? 'n/a'}
              </td>
              <td className='px-3 py-2.5'>
                {model.autoRouteEnabled ? t('Enabled') : t('Disabled')}
              </td>
              <td className='px-3 py-2.5'>
                {model.exclusionReason || t('None')}
              </td>
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
      <table className='w-full min-w-[1060px] text-left text-xs'>
        <thead className='bg-muted/50'>
          <tr>
            {[
              'Model',
              'Protocol',
              'Provider / Channel',
              'Current status',
              'Production usage',
              'Estimated cost',
              'Response speed',
              'Latest verification',
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
              <td className='px-3 py-2'>
                <div className='font-medium'>{profile.canonicalModel}</div>
                <details className='text-muted-foreground mt-1 max-w-64'>
                  <summary className='cursor-pointer'>
                    {t('Operations detail')}
                  </summary>
                  <div className='mt-1 space-y-1 break-words'>
                    <div className='font-mono text-[10px]'>
                      {profile.executionProfileId}
                    </div>
                    <div>
                      {t('Routing score')}:{' '}
                      {profile.profileUtility == null
                        ? t('Not scored')
                        : `${profile.profileUtility.toFixed(3)} · #${profile.profileRank}/${profile.profileCandidateCount}`}
                    </div>
                    <div>
                      {t('Multiplier')}: {profile.multiplier || t('n/a')}x
                    </div>
                    <div>
                      {t('Last error')}:{' '}
                      {
                        monitorReason(
                          profile.lastError || profile.statusReason,
                          t
                        ).title
                      }
                      <div className='mt-0.5'>
                        {
                          monitorReason(
                            profile.lastError || profile.statusReason,
                            t
                          ).description
                        }
                      </div>
                      <div className='font-mono text-[10px]'>
                        {
                          monitorReason(
                            profile.lastError || profile.statusReason,
                            t
                          ).code
                        }
                      </div>
                    </div>
                  </div>
                </details>
              </td>
              <td className='px-3 py-2'>
                {profile.protocol
                  .map((value) => protocolLabel(value, t))
                  .join(', ')}
              </td>
              <td className='px-3 py-2'>
                <div>{profile.provider}</div>
                <div className='text-muted-foreground'>{profile.channel}</div>
              </td>
              <td className='px-3 py-2'>
                <Badge
                  variant={stateTone(
                    profile.routingEligible ? 'healthy' : profile.state
                  )}
                >
                  {monitorStateLabel(
                    profile.routingEligible ? 'eligible' : profile.state,
                    t
                  )}
                </Badge>
                <div className='text-muted-foreground mt-1 max-w-52'>
                  {
                    monitorReason(profile.statusReason || profile.lastError, t)
                      .title
                  }
                </div>
              </td>
              <td className='px-3 py-2'>
                {profile.requestCount > 0 ? (
                  <>
                    <div className='font-medium'>
                      {profile.successCount} / {profile.requestCount}{' '}
                      {t('successful')}
                    </div>
                    <div className='text-muted-foreground'>
                      {t('Success rate')}{' '}
                      {(
                        (profile.successCount / profile.requestCount) *
                        100
                      ).toFixed(1)}
                      %
                    </div>
                  </>
                ) : (
                  <span className='text-muted-foreground'>
                    {t('No production traffic')}
                  </span>
                )}
              </td>
              <td className='px-3 py-2'>
                {profile.profileCost == null ? (
                  <span className='text-muted-foreground'>
                    {t('Price pending verification')}
                  </span>
                ) : (
                  <div className='font-medium'>
                    {t('Estimated ¥{{cost}} per request', {
                      cost: profile.profileCost.toFixed(4),
                    })}
                  </div>
                )}
              </td>
              <td className='px-3 py-2'>
                {profile.p50FirstModelEventLatencyMs ? (
                  <>
                    <div className='font-medium'>
                      P50 {ms(profile.p50FirstModelEventLatencyMs)}
                    </div>
                    <div className='text-muted-foreground'>
                      P95 {ms(profile.p95FirstModelEventLatencyMs)}
                    </div>
                  </>
                ) : (
                  <span className='text-muted-foreground'>
                    {t('No samples')}
                  </span>
                )}
              </td>
              <td className='px-3 py-2'>
                <div>{monitorStateLabel(profile.probeStatus || 'none', t)}</div>
                <div className='text-muted-foreground mt-1'>
                  {profile.lastProbeAt
                    ? new Date(profile.lastProbeAt).toLocaleString()
                    : t('Never verified')}
                </div>
                <div
                  className='text-muted-foreground'
                  title={t(
                    'A fresh Probe only means a recent check ran; it does not mean the check passed.'
                  )}
                >
                  {monitorStateLabel(profile.probeFreshness || 'stale', t)}
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  Clock3,
  HeartPulse,
  Network,
  Search,
  ShieldCheck,
  Table2,
  X,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getApiKeys } from '@/features/keys/api'
import type { ApiKey } from '@/features/keys/types'
import { useIsAdmin } from '@/hooks/use-admin'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getACUChannelMonitor,
  getACUGlobalRoutingPolicy,
  getACURoutingUtilityConfig,
  getACUTokenProfileRouting,
  probeACUExecutionProfileById,
  reconcileACUExecutionProfileEconomics,
  updateACUGlobalRoutingPolicy,
  updateACUProfilePublicNote,
  updateACURoutingUtilityConfig,
  updateACUTokenProfileRouting,
  pauseACUChannel,
  type ACUChannelMonitorProfile,
  type ACUExecutionProfileProbeResult,
  type ACUModelPoolEntry,
  type ACUProbeHistoryRow,
  type ACUMonitorRange,
  type ACUProbeTimelineRange,
  type ACUMonitorScenario,
  type ACUSupplyStrategy,
  type ACUGlobalRoutingPolicy,
  type ACURoutingUtilityConfig,
} from '../api'
import { ACUChannelHealthCard } from './acu-channel-health-card'
import { groupACUChannels, groupACUModels } from './acu-channel-health-model'
import { ACUChannelHistory } from './acu-channel-history'
import { ACUExecutionProfileManager } from './acu-execution-profile-manager'
import {
  modelAccessFor,
  updateGlobalModelAccess,
  updateGlobalProfileRouting,
  type ACUModelAccess,
} from './acu-global-routing-policy'
import { ACUModelHealthCard } from './acu-model-health-card'
import {
  filterProfilesByProtocol,
  monitorReason,
  monitorStateLabel,
  protocolLabel,
  sortMonitorChannels,
  sortMonitorModels,
  sortMonitorProfiles,
  summarizeMonitorProfiles,
  type ACUMonitorProtocol,
  type ACUMonitorSort,
} from './acu-monitor-presentation'
import { ACUProfileProbeInspector } from './acu-profile-probe-inspector'

const MONITOR_REFRESH_MS = 30 * 60_000

type ProbeInspectorState = {
  profile: ACUChannelMonitorProfile
  protocol: 'responses' | 'messages' | 'chat_completions'
  result: ACUExecutionProfileProbeResult | null
  requestError?: string
}

type GlobalModelOption = {
  id: string
  hasConfiguredProfile: boolean
  autoRouteEnabled: boolean
}

type ProfileFilters = {
  model: string
  provider: string
  protocol: string
  state: string
}

const EMPTY_PROFILE_FILTERS: ProfileFilters = {
  model: '',
  provider: '',
  protocol: '',
  state: '',
}

function isProfileGloballyUsable(
  policy: ACUGlobalRoutingPolicy,
  profile: ACUChannelMonitorProfile,
  modelEntries: GlobalModelOption[]
) {
  if (
    !profile.executionProfileId ||
    profile.enabled === false ||
    profile.administratorAllowed === false
  ) {
    return false
  }
  const model = modelEntries.find(
    (entry) => entry.id === profile.canonicalModel
  )
  return Boolean(
    model &&
    modelAccessFor(
      policy,
      model.id,
      model.hasConfiguredProfile,
      model.autoRouteEnabled
    ) !== 'disabled'
  )
}

function buildAvailableModelEntries(
  modelPool: ACUModelPoolEntry[],
  profiles: ACUChannelMonitorProfile[]
): GlobalModelOption[] {
  const ids = new Set([
    ...modelPool.map((item) => item.modelId),
    ...profiles.map((item) => item.canonicalModel),
  ])
  return [...ids]
    .filter(Boolean)
    .sort()
    .map((id) => {
      const modelProfiles = profiles.filter(
        (item) => item.canonicalModel === id
      )
      return {
        id,
        hasConfiguredProfile: modelProfiles.some(
          (item) =>
            item.enabled !== false && item.administratorAllowed !== false
        ),
        autoRouteEnabled: modelProfiles.some(
          (item) =>
            item.enabled !== false &&
            item.administratorAllowed !== false &&
            item.autoRouteEnabled !== false
        ),
      }
    })
}

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
  const [overviewLayout, setOverviewLayout] = useState<'channel' | 'model'>(
    isAdmin ? 'channel' : 'model'
  )
  const [range, setRange] = useState<ACUMonitorRange>('24h')
  const [probeRange, setProbeRange] = useState<ACUProbeTimelineRange>('48h')
  const [supplyStrategy, setSupplyStrategy] =
    useState<ACUSupplyStrategy>('balanced')
  const [scenario, setScenario] = useState<ACUMonitorScenario>('standard')
  const [protocol, setProtocol] = useState<ACUMonitorProtocol>('responses')
  const [sort, setSort] = useState<ACUMonitorSort>('recommended')
  const [filters, setFilters] = useState<ProfileFilters>(EMPTY_PROFILE_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<ProfileFilters>(
    EMPTY_PROFILE_FILTERS
  )
  const [probeInspector, setProbeInspector] =
    useState<ProbeInspectorState | null>(null)
  const [calibrationMessage, setCalibrationMessage] = useState('')
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null)
  const query = useQuery({
    queryKey: [
      'acu-channel-monitor',
      range,
      supplyStrategy,
      scenario,
      probeRange,
      protocol,
    ],
    queryFn: () =>
      getACUChannelMonitor(
        range,
        supplyStrategy,
        scenario,
        probeRange,
        protocol
      ),
    staleTime: MONITOR_REFRESH_MS,
    gcTime: MONITOR_REFRESH_MS,
    refetchInterval: MONITOR_REFRESH_MS,
  })
  const apiKeysQuery = useQuery({
    queryKey: ['channel-monitor-api-keys'],
    queryFn: () => getApiKeys({ p: 1, size: 100 }),
    staleTime: 60_000,
  })
  const apiKeys = useMemo(
    () => apiKeysQuery.data?.data?.items ?? [],
    [apiKeysQuery.data?.data?.items]
  )
  useEffect(() => {
    if (
      selectedTokenId != null &&
      apiKeys.some((token) => token.id === selectedTokenId)
    ) {
      return
    }
    const defaultToken =
      apiKeys.find((token) => token.status === 1) ?? apiKeys[0]
    setSelectedTokenId(defaultToken?.id ?? null)
  }, [apiKeys, selectedTokenId])
  const selectedToken = useMemo<ApiKey | undefined>(
    () => apiKeys.find((token) => token.id === selectedTokenId),
    [apiKeys, selectedTokenId]
  )
  const tokenProfileRoutingQuery = useQuery({
    queryKey: ['acu-token-profile-routing', selectedTokenId],
    queryFn: () => getACUTokenProfileRouting(selectedTokenId as number),
    enabled: selectedTokenId != null,
    staleTime: 15_000,
  })
  const tokenProfileRoutingMutation = useMutation({
    mutationFn: (input: {
      tokenId: number
      executionProfileId: string
      enabled: boolean
    }) =>
      updateACUTokenProfileRouting(
        input.tokenId,
        input.executionProfileId,
        input.enabled
      ),
    onSuccess: async (response) => {
      queryClient.setQueryData(
        ['acu-token-profile-routing', response.data?.tokenId],
        response
      )
      await queryClient.invalidateQueries({
        queryKey: ['channel-monitor-api-keys'],
      })
      toast.success(t('API key routing updated'))
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : t('API key routing update failed')
      ),
  })
  const profileNoteMutation = useMutation({
    mutationFn: (input: { executionProfileId: string; note: string }) =>
      updateACUProfilePublicNote(input.executionProfileId, input.note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['acu-channel-monitor'],
      })
      toast.success(t('Profile note updated'))
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('Profile note update failed')
      ),
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
  const globalRoutingPolicyQuery = useQuery({
    queryKey: ['acu-global-routing-policy'],
    queryFn: getACUGlobalRoutingPolicy,
    enabled: isRoot,
  })
  const globalRoutingMutation = useMutation({
    mutationFn: (input: {
      profileId: string
      policy: ACUGlobalRoutingPolicy
    }) => updateACUGlobalRoutingPolicy(input.policy),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['acu-global-routing-policy'],
        }),
        queryClient.invalidateQueries({ queryKey: ['acu-channel-monitor'] }),
      ])
      toast.success(t('Global routing updated'))
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : t('Global routing update failed')
      ),
  })
  const probeMutation = useMutation({
    mutationFn: ({
      executionProfileId,
      protocol,
    }: {
      executionProfileId: string
      protocol: 'responses' | 'messages' | 'chat_completions'
    }) => probeACUExecutionProfileById(executionProfileId, protocol),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ['acu-channel-monitor'],
      })
      setProbeInspector((current) =>
        current
          ? {
              ...current,
              result: result.data ?? null,
              requestError: result.data
                ? undefined
                : result.message || t('Targeted Probe failed'),
            }
          : current
      )
    },
    onError: (error) =>
      setProbeInspector((current) =>
        current
          ? {
              ...current,
              requestError:
                error instanceof Error ? error.message : t('Probe failed'),
            }
          : current
      ),
  })
  const economicsMutation = useMutation({
    mutationFn: (input: {
      executionProfileId: string
      observedBillingMultiplier: number
      creditsPerCny?: number
    }) =>
      reconcileACUExecutionProfileEconomics(input.executionProfileId, {
        observedBillingMultiplier: input.observedBillingMultiplier,
        creditsPerCny: input.creditsPerCny,
      }),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['acu-channel-monitor'] }),
        queryClient.invalidateQueries({ queryKey: ['acu-execution-profiles'] }),
      ])
      setCalibrationMessage(
        response.data?.applyRequired
          ? t('Saved · Apply configuration required')
          : t('Saved')
      )
    },
    onError: (error) =>
      setCalibrationMessage(
        error instanceof Error ? error.message : t('Calibration failed')
      ),
  })
  const allProfiles = useMemo(
    () => query.data?.data?.profiles ?? [],
    [query.data?.data?.profiles]
  )
  const protocolProfiles = useMemo(
    () => filterProfilesByProtocol(allProfiles, protocol),
    [allProfiles, protocol]
  )
  const profiles = useMemo(() => {
    if (activeTab !== 'current') return []
    return sortMonitorProfiles(
      protocolProfiles.filter(
        (profile) =>
          (!appliedFilters.model ||
            profile.canonicalModel === appliedFilters.model) &&
          (!appliedFilters.provider ||
            profile.provider === appliedFilters.provider) &&
          (!appliedFilters.protocol ||
            profile.protocol.includes(appliedFilters.protocol)) &&
          (!appliedFilters.state || profile.state === appliedFilters.state)
      ),
      sort
    )
  }, [activeTab, appliedFilters, protocolProfiles, sort])
  const channelGroups = useMemo(() => {
    if (activeTab !== 'overview') return []
    return sortMonitorChannels(
      groupACUChannels(
        protocolProfiles,
        query.data?.data?.history ?? [],
        range,
        query.data?.data?.generatedAt,
        query.data?.data?.probeHistory ?? []
      ),
      sort
    )
  }, [
    activeTab,
    protocolProfiles,
    query.data?.data?.generatedAt,
    query.data?.data?.history,
    query.data?.data?.probeHistory,
    range,
    sort,
  ])
  const modelGroups = useMemo(() => {
    if (activeTab !== 'overview' || (isAdmin && overviewLayout !== 'model')) {
      return []
    }
    return sortMonitorModels(
      groupACUModels(
        protocolProfiles,
        query.data?.data?.history ?? [],
        range,
        query.data?.data?.generatedAt,
        query.data?.data?.probeHistory ?? [],
        probeRange
      ),
      sort
    )
  }, [
    activeTab,
    isAdmin,
    overviewLayout,
    protocolProfiles,
    query.data?.data?.generatedAt,
    query.data?.data?.history,
    query.data?.data?.probeHistory,
    probeRange,
    range,
    sort,
  ])
  const profileActions = isRoot
    ? {
        policy: globalRoutingPolicyQuery.data,
        isTogglePending: (profileId: string) =>
          globalRoutingMutation.isPending &&
          globalRoutingMutation.variables?.profileId === profileId,
        isProbePending: (profileId: string) =>
          probeMutation.isPending &&
          probeMutation.variables?.executionProfileId === profileId,
        onToggleRouting: (
          profile: ACUChannelMonitorProfile,
          enabled: boolean
        ) => {
          const policy = globalRoutingPolicyQuery.data
          if (!policy) return
          globalRoutingMutation.mutate({
            profileId: profile.executionProfileId,
            policy: updateGlobalProfileRouting(
              policy,
              allProfiles,
              profile.executionProfileId,
              enabled
            ),
          })
        },
        onProbe: (profile: ACUChannelMonitorProfile, probeProtocol: string) => {
          setCalibrationMessage('')
          setProbeInspector({
            profile,
            protocol: probeProtocol as ProbeInspectorState['protocol'],
            result: null,
          })
          probeMutation.mutate({
            executionProfileId: profile.executionProfileId,
            protocol: probeProtocol as
              | 'responses'
              | 'messages'
              | 'chat_completions',
          })
        },
      }
    : undefined
  const tokenProfileActions =
    selectedToken && selectedTokenId != null
      ? {
          tokenName: selectedToken.name,
          maskedKey: selectedToken.key,
          scope: tokenProfileRoutingQuery.data?.data,
          isPending: (profileId: string) =>
            tokenProfileRoutingMutation.isPending &&
            tokenProfileRoutingMutation.variables?.executionProfileId ===
              profileId,
          onToggle: (profile: ACUChannelMonitorProfile, enabled: boolean) => {
            tokenProfileRoutingMutation.mutate({
              tokenId: selectedTokenId,
              executionProfileId: profile.executionProfileId,
              enabled,
            })
          },
        }
      : undefined
  const profileNoteActions = isAdmin
    ? {
        isPending: (profileId: string) =>
          profileNoteMutation.isPending &&
          profileNoteMutation.variables?.executionProfileId === profileId,
        onEdit: (profile: ACUChannelMonitorProfile) => {
          const note = window.prompt(
            t('Public note visible to users'),
            profile.publicNote ?? ''
          )
          if (note == null) return
          profileNoteMutation.mutate({
            executionProfileId: profile.executionProfileId,
            note,
          })
        },
      }
    : undefined
  const summary = summarizeMonitorProfiles(protocolProfiles)
  const sortLabel = {
    recommended: t('Availability first'),
    routing_score: t('Current routing score'),
    usage: t('Usage high to low'),
    cost: t('Estimated cost low to high'),
    reliability: t('Reliability high to low'),
    speed: t('Response speed fast to slow'),
    recent_issue: t('Most recent issue'),
  }[sort]
  const filtersDirty =
    filters.model !== appliedFilters.model ||
    filters.provider !== appliedFilters.provider ||
    filters.protocol !== appliedFilters.protocol ||
    filters.state !== appliedFilters.state
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
      <div className='bg-card/50 rounded-lg border p-3 sm:p-4'>
        <div className='grid gap-3 lg:grid-cols-[minmax(18rem,1.35fr)_minmax(16rem,1fr)]'>
          <label className='min-w-0 space-y-1 text-xs'>
            <span className='text-muted-foreground'>{t('API key')}</span>
            <select
              aria-label={t('API key')}
              className='bg-background h-9 w-full min-w-0 rounded-md border px-2.5 text-sm'
              value={selectedTokenId ?? ''}
              disabled={apiKeysQuery.isLoading || apiKeys.length === 0}
              onChange={(event) =>
                setSelectedTokenId(
                  event.target.value ? Number(event.target.value) : null
                )
              }
            >
              {apiKeys.length === 0 ? (
                <option value=''>{t('No API keys')}</option>
              ) : null}
              {apiKeys.map((token) => (
                <option key={token.id} value={token.id}>
                  {token.name} · {token.key}
                </option>
              ))}
            </select>
          </label>
          {selectedToken ? (
            <div className='bg-muted/35 flex min-w-0 flex-wrap content-center gap-x-5 gap-y-2 rounded-md px-3 py-2 text-xs'>
              <div className='min-w-0'>
                <div className='text-muted-foreground'>
                  {t('Profile scope')}
                </div>
                <div className='mt-0.5 truncate font-medium'>
                  {tokenProfileRoutingQuery.data?.data?.custom
                    ? t('Custom')
                    : t('Following global routing')}
                </div>
              </div>
              <div className='min-w-0'>
                <div className='text-muted-foreground'>{t('Scope')}</div>
                <div className='mt-0.5 font-medium tabular-nums'>
                  {t(
                    '{{enabled}} of {{total}} globally allowed Profiles enabled',
                    {
                      enabled:
                        tokenProfileRoutingQuery.data?.data?.effectiveProfileIds
                          .length ?? 0,
                      total:
                        tokenProfileRoutingQuery.data?.data?.globalProfileIds
                          .length ?? 0,
                    }
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className='mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(14rem,1.35fr)]'>
          {isAdmin && (
            <>
              <label className='min-w-0 space-y-1 text-xs'>
                <span className='text-muted-foreground'>{t('Time range')}</span>
                <select
                  aria-label={t('Time range')}
                  className='bg-background h-8 w-full rounded-md border px-2 text-xs'
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
              <label className='min-w-0 space-y-1 text-xs'>
                <span className='text-muted-foreground'>
                  {t('Routing score strategy')}
                </span>
                <select
                  aria-label={t('Routing score strategy')}
                  className='bg-background h-8 w-full rounded-md border px-2 text-xs'
                  value={supplyStrategy}
                  onChange={(event) =>
                    setSupplyStrategy(event.target.value as ACUSupplyStrategy)
                  }
                >
                  <option value='balanced'>{t('Balanced')}</option>
                  <option value='lowest_cost'>{t('Lowest cost')}</option>
                  <option value='low_latency'>{t('Low latency')}</option>
                  <option value='high_reliability'>
                    {t('High reliability')}
                  </option>
                </select>
              </label>
              <label className='min-w-0 space-y-1 text-xs'>
                <span className='text-muted-foreground'>
                  {t('Request size')}
                </span>
                <select
                  aria-label={t('Request size')}
                  className='bg-background h-8 w-full rounded-md border px-2 text-xs'
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
              <label className='min-w-0 space-y-1 text-xs'>
                <span className='text-muted-foreground'>
                  {t('Display order')}
                </span>
                <select
                  aria-label={t('Display order')}
                  className='bg-background h-8 w-full rounded-md border px-2 text-xs'
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value as ACUMonitorSort)
                  }
                >
                  <option value='recommended'>{t('Availability first')}</option>
                  <option value='routing_score'>
                    {t('Current routing score')}
                  </option>
                  <option value='usage'>{t('Usage high to low')}</option>
                  <option value='cost'>
                    {t('Estimated cost low to high')}
                  </option>
                  <option value='reliability'>
                    {t('Reliability high to low')}
                  </option>
                  <option value='speed'>
                    {t('Response speed fast to slow')}
                  </option>
                  <option value='recent_issue'>{t('Most recent issue')}</option>
                </select>
              </label>
            </>
          )}
          <div className='min-w-0 space-y-1 text-xs sm:col-span-2 xl:col-span-1'>
            <span className='text-muted-foreground'>{t('Protocol')}</span>
            <div
              className='bg-muted flex h-8 max-w-full min-w-0 rounded-md p-0.5'
              aria-label={t('Protocol')}
            >
              {(
                [
                  ['responses', t('Responses')],
                  ['messages', t('Messages')],
                  ['chat_completions', t('Chat')],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type='button'
                  size='sm'
                  variant={protocol === value ? 'default' : 'ghost'}
                  className='h-7 min-w-0 flex-1 px-2 text-xs'
                  aria-pressed={protocol === value}
                  onClick={() => setProtocol(value)}
                >
                  <span className='truncate'>{label}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className='bg-muted/30 text-muted-foreground border-primary/40 flex items-start gap-2 rounded-md border-l-2 px-3 py-2 text-xs'>
        <ShieldCheck className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
        <div>
          <div>
            {t(
              'The routing score strategy changes scores and ranks; display order only changes how cards are shown.'
            )}
          </div>
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
      <div className='bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border md:grid-cols-3 xl:grid-cols-6'>
        {statItems.map(([label, value, Icon]) => (
          <div key={label} className='bg-background min-w-0 p-2.5 sm:p-3'>
            <div className='text-muted-foreground flex items-start gap-1.5 text-[11px] leading-4'>
              <Icon className='size-3.5' />
              {label}
            </div>
            <div className='mt-1 text-base font-semibold tabular-nums'>
              {value}
            </div>
          </div>
        ))}
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className='min-w-0'>
        <div className='max-w-full overflow-x-auto pb-1'>
          <TabsList className='min-w-max'>
            <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value='current'>{t('Profiles')}</TabsTrigger>
                <TabsTrigger value='probes'>{t('Probe history')}</TabsTrigger>
                <TabsTrigger value='history'>{t('History')}</TabsTrigger>
                <TabsTrigger value='inventory'>
                  {t('Supply inventory')}
                </TabsTrigger>
                <TabsTrigger value='models'>{t('Model pool')}</TabsTrigger>
                {isRoot && (
                  <TabsTrigger value='routing'>
                    {t('Router configuration')}
                  </TabsTrigger>
                )}
              </>
            )}
          </TabsList>
        </div>
        <TabsContent value='overview' className='min-w-0 space-y-3'>
          {(isAdmin || overviewLayout === 'model') && (
            <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-2'>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                {isAdmin && (
                  <>
                    <span className='text-muted-foreground text-xs font-medium'>
                      {t('Layout')}
                    </span>
                    <div
                      className='bg-muted inline-flex rounded-md p-0.5'
                      aria-label={t('Layout')}
                    >
                      <Button
                        size='sm'
                        variant={
                          overviewLayout === 'channel' ? 'default' : 'ghost'
                        }
                        className='h-7 px-2.5 text-xs'
                        aria-pressed={overviewLayout === 'channel'}
                        onClick={() => setOverviewLayout('channel')}
                      >
                        <Network className='size-3.5' />
                        {t('By channel')}
                      </Button>
                      <Button
                        size='sm'
                        variant={
                          overviewLayout === 'model' ? 'default' : 'ghost'
                        }
                        className='h-7 px-2.5 text-xs'
                        aria-pressed={overviewLayout === 'model'}
                        onClick={() => setOverviewLayout('model')}
                      >
                        <Table2 className='size-3.5' />
                        {t('By model')}
                      </Button>
                    </div>
                  </>
                )}
                {overviewLayout === 'model' && (
                  <>
                    <span className='text-muted-foreground ml-1 text-xs font-medium'>
                      {t('Probe history')}
                    </span>
                    <div className='bg-muted inline-flex rounded-md p-0.5'>
                      {(['24h', '48h', '7d'] as const).map((value) => (
                        <Button
                          key={value}
                          size='sm'
                          variant={probeRange === value ? 'default' : 'ghost'}
                          className='h-7 px-2.5 text-xs'
                          aria-pressed={probeRange === value}
                          onClick={() => setProbeRange(value)}
                        >
                          {value}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {isAdmin ? (
                <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                  <span>{t('Display order')}</span>
                  <Badge variant='outline' className='font-normal'>
                    {sortLabel}
                  </Badge>
                </div>
              ) : null}
            </div>
          )}
          <div className='grid min-w-0 gap-3 xl:grid-cols-2'>
            {overviewLayout === 'channel'
              ? channelGroups.map((channel) => (
                  <ACUChannelHealthCard
                    key={channel.channel}
                    channel={channel}
                    generatedAt={query.data?.data?.generatedAt ?? ''}
                    profileActions={profileActions}
                    profileNoteActions={profileNoteActions}
                    tokenProfileActions={tokenProfileActions}
                  />
                ))
              : modelGroups.map((model) => (
                  <ACUModelHealthCard
                    key={model.modelId}
                    model={model}
                    showDiagnostics={isAdmin}
                    probeRange={probeRange}
                    profileActions={profileActions}
                    tokenProfileActions={tokenProfileActions}
                    profileNoteActions={profileNoteActions}
                  />
                ))}
          </div>
          {((overviewLayout === 'channel' && channelGroups.length === 0) ||
            (overviewLayout === 'model' && modelGroups.length === 0)) &&
            !query.isLoading && (
              <div className='text-muted-foreground rounded border p-8 text-center text-xs'>
                {t('No model profiles')}
              </div>
            )}
        </TabsContent>
        <TabsContent value='current' className='min-w-0 space-y-3'>
          <div className='bg-card/50 rounded-lg border p-2.5 sm:p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <span className='text-sm font-semibold'>{t('Profiles')}</span>
                <Badge variant='outline' className='font-normal tabular-nums'>
                  {profiles.length} / {protocolProfiles.length}
                </Badge>
                {filtersDirty ? (
                  <Badge variant='warning'>{t('Pending')}</Badge>
                ) : null}
              </div>
              <div className='text-muted-foreground text-xs'>
                {t('Display order')}:{' '}
                <span className='text-foreground'>{sortLabel}</span>
              </div>
            </div>
            <div className='mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]'>
              {(
                [
                  ['model', t('Model')],
                  ['protocol', t('Protocol')],
                  ['provider', t('Provider')],
                  ['state', t('State')],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className='min-w-0 space-y-1 text-xs'>
                  <span className='text-muted-foreground'>{label}</span>
                  <select
                    aria-label={label}
                    className='bg-background h-8 w-full min-w-0 rounded-md border px-2 text-xs'
                    value={filters[key]}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  >
                    <option value=''>{t('All')}</option>
                    {[...new Set(profileFilterValues(protocolProfiles, key))]
                      .filter(Boolean)
                      .sort()
                      .map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <div className='flex items-end gap-2'>
                <Button
                  size='sm'
                  className='h-8'
                  onClick={() => setAppliedFilters(filters)}
                >
                  <Search className='size-3.5' />
                  {t('Search')}
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  className='h-8'
                  disabled={
                    Object.values(filters).every((value) => value === '') &&
                    Object.values(appliedFilters).every((value) => value === '')
                  }
                  onClick={() => {
                    setFilters(EMPTY_PROFILE_FILTERS)
                    setAppliedFilters(EMPTY_PROFILE_FILTERS)
                  }}
                >
                  <X className='size-3.5' />
                  {t('Clear filters')}
                </Button>
              </div>
            </div>
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
      <ACUProfileProbeInspector
        open={probeInspector !== null}
        profile={probeInspector?.profile ?? null}
        protocol={probeInspector?.protocol ?? null}
        loading={probeMutation.isPending}
        result={probeInspector?.result ?? null}
        requestError={probeInspector?.requestError}
        savePending={economicsMutation.isPending}
        saveMessage={calibrationMessage}
        onOpenChange={(open) => {
          if (!open) setProbeInspector(null)
        }}
        onSaveCalibration={(input) => {
          if (!probeInspector) return
          economicsMutation.mutate({
            executionProfileId: probeInspector.profile.executionProfileId,
            ...input,
          })
        }}
      />
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
    const modelEntries = buildAvailableModelEntries(
      props.modelPool,
      props.profiles
    )
    const nextPolicy = structuredClone(savedPolicy)
    nextPolicy.modelAccess = Object.fromEntries(
      modelEntries.map((entry) => [
        entry.id,
        modelAccessFor(
          nextPolicy,
          entry.id,
          entry.hasConfiguredProfile,
          entry.autoRouteEnabled
        ),
      ])
    )
    const availableProfileIds = new Set(
      props.profiles
        .filter((profile) =>
          isProfileGloballyUsable(nextPolicy, profile, modelEntries)
        )
        .map((profile) => profile.executionProfileId)
    )
    nextPolicy.allowedProfileIds = nextPolicy.allowedProfileIds.filter((id) =>
      availableProfileIds.has(id)
    )
    setPolicyDraft(nextPolicy)
    setUtilityDraft(structuredClone(savedUtilityConfig))
    setEditing(true)
  }
  const cancelEditing = () => {
    setPolicyDraft(undefined)
    setUtilityDraft(undefined)
    setEditing(false)
  }
  const availableModelEntries = useMemo(
    () => buildAvailableModelEntries(props.modelPool, props.profiles),
    [props.modelPool, props.profiles]
  )
  const editingPolicy = policyDraft ?? savedPolicy
  const availableProfileIds = useMemo(
    () =>
      new Set(
        props.profiles
          .filter((item) =>
            editingPolicy
              ? isProfileGloballyUsable(
                  editingPolicy,
                  item,
                  availableModelEntries
                )
              : false
          )
          .map((item) => item.executionProfileId)
      ),
    [availableModelEntries, editingPolicy, props.profiles]
  )
  const availableProfileIdList = useMemo(
    () => [...availableProfileIds].sort(),
    [availableProfileIds]
  )
  const modelOptions = useMemo(() => {
    if (!editingPolicy) return []
    return availableModelEntries.map((entry) => ({
      ...entry,
      access: modelAccessFor(
        editingPolicy,
        entry.id,
        entry.hasConfiguredProfile,
        entry.autoRouteEnabled
      ),
    }))
  }, [availableModelEntries, editingPolicy])
  const profileOptions = useMemo(() => {
    if (!editingPolicy) return []
    return props.profiles
      .filter((profile) => profile.executionProfileId)
      .map((profile) => {
        const model = availableModelEntries.find(
          (entry) => entry.id === profile.canonicalModel
        )
        const modelAccess = model
          ? modelAccessFor(
              editingPolicy,
              model.id,
              model.hasConfiguredProfile,
              model.autoRouteEnabled
            )
          : 'disabled'
        let disabledReason: string | undefined
        if (
          profile.enabled === false ||
          profile.administratorAllowed === false
        ) {
          disabledReason = 'Profile is disabled'
        } else if (modelAccess === 'disabled') {
          disabledReason = 'Model is disabled'
        }
        return {
          id: profile.executionProfileId,
          unavailable: Boolean(disabledReason),
          disabled: Boolean(disabledReason),
          disabledReason,
        }
      })
  }, [availableModelEntries, editingPolicy, props.profiles])
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
  const beginProfileCustomPolicy = (custom: boolean) => {
    if (!policyDraft) return
    const allowedProfileIds =
      custom && policyDraft.allowedProfileIds.length === 0
        ? availableProfileIdList
        : policyDraft.allowedProfileIds
    setPolicyDraft({
      ...policyDraft,
      profilePolicy: custom ? 'custom_allowlist' : 'all_routing_eligible',
      allowedProfileIds,
    })
  }
  const changeModelAccess = (
    modelId: string,
    access: 'disabled' | 'explicit' | 'auto'
  ) => {
    if (!policyDraft) return
    setPolicyDraft(updateGlobalModelAccess(policyDraft, modelId, access))
  }
  const modelAccessForSave = policyDraft
    ? Object.fromEntries(
        availableModelEntries.map((entry) => [
          entry.id,
          modelAccessFor(
            policyDraft,
            entry.id,
            entry.hasConfiguredProfile,
            entry.autoRouteEnabled
          ),
        ])
      )
    : {}
  const autoModelIds = Object.entries(modelAccessForSave)
    .filter(([, access]) => access === 'auto')
    .map(([modelId]) => modelId)
  const policyToSave: ACUGlobalRoutingPolicy | undefined = policyDraft
    ? {
        ...policyDraft,
        modelAccess: modelAccessForSave,
        modelPolicy: autoModelIds.length ? 'custom_allowlist' : 'explicit_only',
        allowedModelIds: autoModelIds,
        allowedProfileIds: policyDraft.allowedProfileIds.filter((profileId) => {
          const profile = props.profiles.find(
            (item) => item.executionProfileId === profileId
          )
          return (
            profile !== undefined &&
            isProfileGloballyUsable(
              { ...policyDraft, modelAccess: modelAccessForSave },
              profile,
              availableModelEntries
            )
          )
        }),
      }
    : undefined
  return (
    <div className='space-y-4'>
      <ACUExecutionProfileManager />
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
                {t('Global model access')}
              </div>
              <div className='mt-1'>
                {availableModelEntries.map((entry) => (
                  <div key={entry.id} className='flex justify-between gap-3'>
                    <span className='truncate font-mono'>{entry.id}</span>
                    <span>
                      {t(
                        modelAccessLabel(
                          modelAccessFor(
                            savedPolicy,
                            entry.id,
                            entry.hasConfiguredProfile,
                            entry.autoRouteEnabled
                          )
                        )
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground'>
                {t('Global Profile availability')}
              </div>
              <div className='mt-1'>
                {scopeSummary(
                  savedPolicy.profilePolicy,
                  savedPolicy.allowedProfileIds,
                  t('All configured Profiles'),
                  t('Custom allowlist'),
                  availableProfileIdList
                )}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground'>
                {t('Model Preference')}
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
                {t('Profile Preference')}
              </div>
              <div className='mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2'>
                {Object.entries(
                  savedUtilityConfig.defaultProfilePreferenceScores ?? {}
                ).map(([profileId, score]) => (
                  <div key={profileId} className='flex justify-between gap-3'>
                    <span className='truncate font-mono'>{profileId}</span>
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
          <ModelAccessEditor
            options={modelOptions}
            onChange={changeModelAccess}
          />
          <PolicyScopeEditor
            title={t('Available Profiles')}
            allLabel={t('All configured Profiles')}
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
            profiles={props.profiles}
            onChange={setUtilityDraft}
          />
          <div className='flex flex-wrap gap-2'>
            <Button
              size='sm'
              disabled={saveMutation.isPending}
              onClick={() => {
                if (!policyToSave) return
                saveMutation.mutate({
                  policy: policyToSave,
                  utilityConfig: utilityDraft,
                })
              }}
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
  profiles: ACUChannelMonitorProfile[]
  onChange: (value: ACURoutingUtilityConfig) => void
}) {
  const { t } = useTranslation()
  const [candidatePreferencesOpen, setCandidatePreferencesOpen] =
    useState(false)
  const [profilePreferencesOpen, setProfilePreferencesOpen] = useState(false)
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
  const preferenceProfiles = useMemo(
    () =>
      props.profiles
        .filter(
          (profile) =>
            profile.enabled &&
            profile.administratorAllowed &&
            profile.autoRouteEnabled
        )
        .sort(
          (left, right) =>
            left.canonicalModel.localeCompare(right.canonicalModel) ||
            left.executionProfileId.localeCompare(right.executionProfileId)
        ),
    [props.profiles]
  )
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
            {t('Model Preference')}
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
                          aria-label={`${candidate.candidateId} ${t('Model Preference')}`}
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
        <div className='rounded border p-2'>
          <Button
            size='sm'
            variant='ghost'
            aria-expanded={profilePreferencesOpen}
            onClick={() => setProfilePreferencesOpen((open) => !open)}
          >
            {t('Profile Preference')}
          </Button>
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'Profile preferences multiply base Profile utility after eligibility and health checks.'
            )}
          </p>
          {profilePreferencesOpen && (
            <div className='mt-3 grid max-h-96 gap-2 overflow-y-auto pr-1 md:grid-cols-2'>
              {preferenceProfiles.map((profile) => (
                <label
                  key={profile.executionProfileId}
                  className='grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 rounded border p-2 text-xs'
                >
                  <span className='min-w-0'>
                    <span className='block truncate font-medium'>
                      {profile.canonicalModel}
                    </span>
                    <span
                      className='text-muted-foreground block truncate font-mono'
                      title={profile.executionProfileId}
                    >
                      {profile.executionProfileId}
                    </span>
                  </span>
                  <input
                    aria-label={`${profile.executionProfileId} ${t('Profile Preference')}`}
                    className='bg-background h-8 w-full rounded-md border px-2'
                    type='number'
                    min={0}
                    max={200}
                    step={0.1}
                    value={
                      (props.value.defaultProfilePreferenceScores ?? {})[
                        profile.executionProfileId
                      ] ?? 100
                    }
                    onChange={(event) => {
                      const score = event.target.valueAsNumber
                      const next = {
                        ...props.value.defaultProfilePreferenceScores,
                      }
                      if (!Number.isFinite(score) || score === 100) {
                        delete next[profile.executionProfileId]
                      } else {
                        next[profile.executionProfileId] = score
                      }
                      props.onChange({
                        ...props.value,
                        defaultProfilePreferenceScores: next,
                      })
                    }}
                  />
                </label>
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
              'Custom mode starts with all currently configured entries selected. Uncheck entries to exclude them.'
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

function modelAccessLabel(access: ACUModelAccess) {
  if (access === 'auto') return 'Auto + explicit'
  if (access === 'explicit') return 'Explicit only'
  return 'Disabled'
}

function ModelAccessEditor(props: {
  options: Array<GlobalModelOption & { access: ACUModelAccess }>
  onChange: (modelId: string, access: ACUModelAccess) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-2 rounded border p-2'>
      <div className='text-xs font-medium'>{t('Allowed models')}</div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Disabled models are hidden from external model lists. Explicit-only models can be called by name but are excluded from ACU Auto.'
        )}
      </p>
      <div className='max-h-64 space-y-1 overflow-y-auto'>
        {props.options.map((option) => (
          <label
            key={option.id}
            className='flex items-center justify-between gap-3 text-xs'
          >
            <span className='min-w-0 truncate font-mono'>
              {option.id}
              {!option.hasConfiguredProfile && (
                <span className='text-muted-foreground'>
                  {' '}
                  · {t('no usable Profile')}
                </span>
              )}
            </span>
            <select
              className='bg-background h-7 shrink-0 rounded border px-1.5'
              aria-label={option.id}
              value={option.access}
              disabled={!option.hasConfiguredProfile}
              onChange={(event) =>
                props.onChange(option.id, event.target.value as ACUModelAccess)
              }
            >
              <option value='disabled'>{t('Disabled')}</option>
              <option value='explicit'>{t('Explicit only')}</option>
              <option value='auto' disabled={!option.autoRouteEnabled}>
                {t('Auto + explicit')}
              </option>
            </select>
          </label>
        ))}
      </div>
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

function MonitorLatencyCell(props: {
  profile: ACUChannelMonitorProfile
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (props.profile.fullPoolProbeLatencyP50Ms) {
    return (
      <>
        <div className='font-medium'>
          Full Probe P50 {ms(props.profile.fullPoolProbeLatencyP50Ms)}
        </div>
        <div className='text-muted-foreground'>
          P90 {ms(props.profile.fullPoolProbeLatencyP90Ms)}
        </div>
      </>
    )
  }
  if (props.profile.p50FirstModelEventLatencyMs) {
    return (
      <>
        <div className='font-medium'>
          Production P50 {ms(props.profile.p50FirstModelEventLatencyMs)}
        </div>
        <div className='text-muted-foreground'>
          P95 {ms(props.profile.p95FirstModelEventLatencyMs)}
        </div>
      </>
    )
  }
  return <span className='text-muted-foreground'>{props.t('No samples')}</span>
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
                <MonitorLatencyCell profile={profile} t={t} />
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

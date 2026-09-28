import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Braces, Info, RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  preferenceDisplayText,
  preferenceDocumentLabel,
} from '@/features/private-acu/preference-display'
import { PromptExamples } from '@/features/private-acu/prompt-examples'
import { getAllUsers, searchUsers } from '@/features/users/api'
import { useDebounce } from '@/hooks'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getPrivateACUMemory,
  getPrivateACUFilmStatus,
  getPrivateACUPrompts,
  resetPrivateACUPrompts,
  savePrivateACUPrompts,
  savePrivateACURuntime,
  type PrivateACUMemory,
  type PrivateACUPromptCard,
  type PrivateACUPrompts,
  getPrivateACUUsage,
  getPrivateACUExperiences,
  getPrivateACUExperienceDetail,
  getPrivateACUAdvisors,
  getPrivateACUUserConfigs,
  updatePrivateACUUserConfig,
  type PrivateACUUserConfig,
  type PrivateACUUserConfigSummary,
} from '../../private-acu-admin-api'
import { PrivateACUFilmPOC } from './private-acu-film-poc'
import { PrivateACULearningRuns } from './private-acu-learning-runs'
import { PrivateACUSkillCatalog } from './private-acu-skill-catalog'

function PromptEditor(props: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <label className='space-y-2'>
      <span className='text-sm font-medium'>{props.label}</span>
      <Textarea
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        className='min-h-48 font-mono text-xs'
      />
    </label>
  )
}

function AdvisorSettingHint(props: { label: string; children: ReactNode }) {
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-sm'
              aria-label={props.label}
            />
          }
        >
          <Info className='size-3.5' />
        </TooltipTrigger>
        <TooltipContent className='max-w-80 text-xs leading-5'>
          {props.children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function UserConfigStatus(props: { enabled: boolean }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant={props.enabled ? 'default' : 'outline'}
      className='text-[10px]'
    >
      {props.enabled ? t('Enabled') : t('Disabled')}
    </Badge>
  )
}

export function PrivateACUUserConfigTable(props: {
  configs: PrivateACUUserConfigSummary[]
  users: Array<{ id: number; username: string; display_name?: string }>
  loading: boolean
  error: boolean
  onSelect: (userId: string) => void
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (props.error) {
    return (
      <div className='text-muted-foreground text-sm'>
        {t('Failed to load Private ACU user status')}
      </div>
    )
  }
  const enabledConfigs = props.configs.filter(
    (config) =>
      config.learningEnabled ||
      config.observerEnabled ||
      config.advisorEnabled ||
      config.injectionEnabled
  )
  if (!enabledConfigs.length) {
    return (
      <div className='text-muted-foreground text-sm'>
        {t('No users have enabled Private ACU supervision')}
      </div>
    )
  }
  const usersById = new Map(props.users.map((user) => [String(user.id), user]))
  return (
    <div className='border-border overflow-auto rounded-md border'>
      <table className='w-full min-w-[42rem] text-left text-xs'>
        <thead className='bg-muted/40'>
          <tr>
            <th className='p-2'>{t('User')}</th>
            <th className='p-2'>{t('Account learning')}</th>
            <th className='p-2'>{t('Observer')}</th>
            <th className='p-2'>{t('Advisor')}</th>
            <th className='p-2'>{t('Injected')}</th>
            <th className='p-2'>{t('Observer interval')}</th>
            <th className='p-2'>{t('Interval source')}</th>
          </tr>
        </thead>
        <tbody>
          {enabledConfigs.map((entry) => {
            const user = usersById.get(entry.newapiUserId)
            const label = user
              ? `${user.username} · #${entry.newapiUserId}`
              : `#${entry.newapiUserId}`
            return (
              <tr
                key={entry.newapiUserId}
                className='border-border border-t align-middle'
              >
                <td className='p-2'>
                  <button
                    type='button'
                    className='text-primary text-left underline-offset-2 hover:underline'
                    onClick={() => props.onSelect(entry.newapiUserId)}
                  >
                    {label}
                  </button>
                </td>
                <td className='p-2'>
                  <UserConfigStatus enabled={entry.learningEnabled} />
                </td>
                <td className='p-2'>
                  <UserConfigStatus enabled={entry.observerEnabled} />
                </td>
                <td className='p-2'>
                  <UserConfigStatus enabled={entry.advisorEnabled} />
                </td>
                <td className='p-2'>
                  <UserConfigStatus enabled={entry.injectionEnabled} />
                </td>
                <td className='p-2 whitespace-nowrap'>
                  {entry.effectiveObserverInterval}
                </td>
                <td className='p-2'>
                  {entry.usesGlobalObserverInterval
                    ? t('Global default')
                    : t('User override')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type PrivateACUUserOption = {
  value: string
  label: string
}

export function PrivateACUUserSelector(props: {
  options: PrivateACUUserOption[]
  value: string
  searchValue: string
  loading: boolean
  onSearchValueChange: (value: string) => void
  onValueChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Combobox
      options={props.options}
      value={props.value}
      onValueChange={(value) => props.onValueChange(value ?? '')}
      onSearchValueChange={props.onSearchValueChange}
      placeholder={t('Select a user')}
      emptyText={
        props.loading && props.searchValue.trim()
          ? t('Loading')
          : t('No users found')
      }
      filterOptions={false}
      className='max-w-md'
    />
  )
}

function MemorySection(props: { memory?: PrivateACUMemory; loading: boolean }) {
  const { t } = useTranslation()
  if (props.loading) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (!props.memory?.enabled) {
    return (
      <div className='text-muted-foreground text-sm'>
        {t('Acontext is not configured')}
      </div>
    )
  }
  return (
    <div className='space-y-3'>
      <div className='text-muted-foreground text-xs'>
        {t('Learning space')}: {props.memory.spaceId || t('Not created')}
      </div>
      <PrivateACUSkillCatalog skills={props.memory.skills} />
    </div>
  )
}

export function AcontextSourceFiles(props: {
  files?: PrivateACUMemory['internalPrompts']
}) {
  const { t } = useTranslation()
  if (!props.files) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Acontext implementation source is unavailable')}
      </p>
    )
  }
  return (
    <div className='space-y-3'>
      {props.files.map((file) => (
        <details
          key={file.path}
          className='border-border rounded-md border p-3'
        >
          <summary className='cursor-pointer font-mono text-xs'>
            {preferenceDocumentLabel(file.path, t('Preference document'))}
          </summary>
          <pre className='bg-muted/30 mt-3 max-h-[32rem] overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
            {preferenceDisplayText(file.content)}
          </pre>
        </details>
      ))}
    </div>
  )
}

function promptStageLabel(
  stage: PrivateACUPromptCard['stage'],
  t: ReturnType<typeof useTranslation>['t']
) {
  const labels: Record<PrivateACUPromptCard['stage'], string> = {
    judge: t('Signal judgment'),
    task: t('Task organization'),
    distillation: t('Preference distillation'),
    skill_learner: t('Skill update'),
  }
  return labels[stage]
}

function RuntimePromptCardsSection(props: {
  cards?: PrivateACUPromptCard[]
  loading: boolean
  error: boolean
  emptyText: string
  collapsePrompt?: boolean
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (props.error) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Runtime prompts are unavailable')}
      </p>
    )
  }
  if (!props.cards?.length) {
    return <p className='text-muted-foreground text-sm'>{props.emptyText}</p>
  }
  return (
    <div className='grid gap-3'>
      {props.cards.map((card, index) => (
        <article
          key={card.id}
          className='border-border bg-card flex min-w-0 flex-col gap-4 rounded-md border p-4'
        >
          <div className='flex items-start justify-between gap-3'>
            <div className='flex min-w-0 items-start gap-3'>
              <span className='bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className='min-w-0'>
                <h3 className='text-sm font-semibold'>
                  {preferenceDisplayText(card.title)}
                </h3>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {promptStageLabel(card.stage, t)}
                </p>
              </div>
            </div>
            <div className='flex shrink-0 gap-1.5'>
              <Badge
                variant={card.execution === 'used' ? 'default' : 'outline'}
                className='text-[10px]'
              >
                {card.execution === 'used'
                  ? t('Executed')
                  : t('Not executed in this flow')}
              </Badge>
              <Badge variant='secondary' className='text-[10px]'>
                {card.language}
              </Badge>
            </div>
          </div>
          <p className='text-muted-foreground text-xs leading-5'>
            {preferenceDisplayText(card.description)}
          </p>
          <dl className='grid gap-2 text-xs sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>{t('Source')}</dt>
              <dd className='mt-1 break-all'>
                {promptStageLabel(card.stage, t)}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('Runtime status')}</dt>
              <dd className='mt-1'>
                {card.execution === 'used'
                  ? t('This prompt is used by the current learning path.')
                  : t('This prompt is configured but skipped by this path.')}
              </dd>
            </div>
          </dl>
          <div className='border-border border-t pt-3'>
            {props.collapsePrompt ? (
              <details>
                <summary className='cursor-pointer text-xs font-medium'>
                  {t('View full prompt')}
                </summary>
                <pre className='bg-muted/30 mt-3 max-h-96 overflow-auto rounded-md p-3 text-xs leading-5 whitespace-pre-wrap'>
                  {preferenceDisplayText(card.content)}
                </pre>
              </details>
            ) : (
              <>
                <div className='mb-2 text-xs font-medium'>
                  {t('Full runtime prompt')}
                </div>
                <pre className='bg-muted/30 max-h-96 overflow-auto rounded-md p-3 text-xs leading-5 whitespace-pre-wrap'>
                  {preferenceDisplayText(card.content)}
                </pre>
              </>
            )}
          </div>
          <PromptExamples examples={card.examples} />
        </article>
      ))}
    </div>
  )
}

export function PrivateACUAdmin(
  props: { view?: 'all' | 'account' | 'prompts' } = {}
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const canEdit = userRole === ROLE.SUPER_ADMIN
  const [draft, setDraft] = useState<PrivateACUPrompts>()
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedUserOption, setSelectedUserOption] =
    useState<PrivateACUUserOption>()
  const [userSearch, setUserSearch] = useState('')
  const debouncedUserSearch = useDebounce(userSearch, 300)
  const usersQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'users'],
    queryFn: () => getAllUsers({ sort_by: 'id', sort_order: 'asc' }),
  })
  const userSearchQuery = useQuery({
    queryKey: [
      'dashboard',
      'private-acu-admin',
      'user-search',
      debouncedUserSearch,
    ],
    queryFn: () =>
      searchUsers({
        keyword: debouncedUserSearch,
        page_size: 20,
        sort_by: 'id',
        sort_order: 'asc',
      }),
    enabled: debouncedUserSearch.trim().length > 0,
    staleTime: 30_000,
  })
  const promptsQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'prompts'],
    queryFn: getPrivateACUPrompts,
  })
  const userConfigsQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'user-configs'],
    queryFn: getPrivateACUUserConfigs,
  })
  const filmPromptsQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'film-prompts'],
    queryFn: getPrivateACUFilmStatus,
    enabled: props.view === 'prompts',
  })
  const memoryQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'memory', selectedUserId],
    queryFn: () => getPrivateACUMemory(selectedUserId),
  })
  const usageQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'usage', selectedUserId],
    queryFn: () => getPrivateACUUsage(selectedUserId),
    enabled: Boolean(selectedUserId),
  })
  useEffect(() => {
    if (promptsQuery.data) setDraft(promptsQuery.data)
  }, [promptsQuery.data])
  useEffect(() => {
    if (memoryQuery.data?.userId && !selectedUserId) {
      setSelectedUserId(memoryQuery.data.userId)
    }
  }, [memoryQuery.data?.userId, selectedUserId])
  const saveMutation = useMutation({
    mutationFn: savePrivateACUPrompts,
    onSuccess: (data) => {
      setDraft(data)
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'private-acu-admin', 'prompts'],
      })
      toast.success(t('Private ACU prompts saved'))
    },
    onError: () => toast.error(t('Failed to save Private ACU prompts')),
  })
  const resetMutation = useMutation({
    mutationFn: resetPrivateACUPrompts,
    onSuccess: (data) => {
      setDraft(data)
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'private-acu-admin', 'prompts'],
      })
      toast.success(t('Private ACU prompts reset'))
    },
    onError: () => toast.error(t('Failed to reset Private ACU prompts')),
  })
  const runtimeMutation = useMutation({
    mutationFn: savePrivateACURuntime,
    onSuccess: (data) => {
      setDraft(data)
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'private-acu-admin', 'prompts'],
      })
      toast.success(t('Private ACU system settings saved'))
    },
    onError: () => toast.error(t('Failed to save Private ACU system settings')),
  })
  const userConfigMutation = useMutation({
    mutationFn: (input: {
      userId: string
      config: Pick<
        PrivateACUUserConfig,
        | 'learningEnabled'
        | 'observerEnabled'
        | 'advisorEnabled'
        | 'injectionEnabled'
        | 'observerInterval'
      >
    }) => updatePrivateACUUserConfig(input.userId, input.config),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'private-acu-admin', 'user-configs'],
      })
      toast.success(t('Private ACU user settings saved'))
    },
    onError: () => toast.error(t('Failed to save Private ACU user settings')),
  })
  const disabled = saveMutation.isPending || resetMutation.isPending
  const editable = draft
    ? {
        observerPrompt: draft.observerPrompt,
        advisorPrompt: draft.advisorPrompt,
        learningPrompt: draft.learningPrompt,
        enabled: draft.enabled,
        advisorReferenceEnabled: draft.advisorReferenceEnabled,
        observerInterval: draft.observerInterval,
      }
    : undefined
  const userOptions = useMemo(() => {
    const searchSettled = userSearch === debouncedUserSearch
    let users = usersQuery.data?.data?.items ?? []
    if (userSearch.trim()) {
      users = searchSettled ? (userSearchQuery.data?.data?.items ?? []) : []
    }
    const options = users.map((user) => ({
      value: String(user.id),
      label: `${user.username} · #${user.id}`,
    }))
    if (
      selectedUserOption &&
      !options.some((option) => option.value === selectedUserOption.value)
    ) {
      options.unshift(selectedUserOption)
    }
    return options
  }, [
    debouncedUserSearch,
    selectedUserOption,
    userSearch,
    userSearchQuery.data?.data?.items,
    usersQuery.data?.data?.items,
  ])
  const selectUser = (userId: string) => {
    setSelectedUserId(userId)
    setSelectedUserOption(
      userOptions.find((option) => option.value === userId) ??
        (userId ? { value: userId, label: `#${userId}` } : undefined)
    )
    setUserSearch('')
  }
  const selectedConfig =
    userConfigsQuery.data?.find(
      (config) => config.newapiUserId === selectedUserId
    ) ??
    (draft
      ? {
          learningEnabled: false,
          observerEnabled: false,
          advisorEnabled: false,
          injectionEnabled: false,
          observerInterval: undefined,
          effectiveObserverInterval: draft.observerInterval,
          globalObserverInterval: draft.observerInterval,
          usesGlobalObserverInterval: true,
          globalEnabled: draft.enabled,
          globalInjectionEnabled: draft.advisorReferenceEnabled,
        }
      : undefined)
  const saveSelectedConfig = (patch: Partial<PrivateACUUserConfig>) => {
    if (!selectedUserId || !selectedConfig) return
    userConfigMutation.mutate({
      userId: selectedUserId,
      config: {
        learningEnabled: selectedConfig.learningEnabled,
        observerEnabled: selectedConfig.observerEnabled,
        advisorEnabled: selectedConfig.advisorEnabled,
        injectionEnabled: selectedConfig.injectionEnabled,
        observerInterval: selectedConfig.observerInterval,
        ...patch,
      },
    })
  }
  const accountJudgeCard: PrivateACUPromptCard | undefined = promptsQuery.data
    ? {
        id: 'account-learning-judge',
        stage: 'judge',
        title: t('User dissatisfaction Learning Judge'),
        description: t(
          'Evaluates the latest human message and decides whether the account learning path should start.'
        ),
        content: promptsQuery.data.learningPrompt,
        language: /[\u3400-\u9fff]/u.test(promptsQuery.data.learningPrompt)
          ? 'zh-CN'
          : 'en',
        source: `${t('ACU Router prompt configuration')} · v${promptsQuery.data.promptVersion}`,
        execution: 'used',
        examples: promptsQuery.data.learningExamples,
      }
    : undefined
  const accountAcontextCards =
    memoryQuery.data?.promptCards?.filter(
      (card) => card.execution === 'used' && card.stage !== 'task'
    ) ?? []
  const accountRuntimeCards = accountJudgeCard
    ? [accountJudgeCard, ...accountAcontextCards]
    : accountAcontextCards
  const bypassedAccountCards =
    memoryQuery.data?.promptCards?.filter(
      (card) => card.execution !== 'used' || card.stage === 'task'
    ) ?? []
  let usageContent = null
  if (usageQuery.isLoading) {
    usageContent = (
      <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
    )
  } else if (usageQuery.data) {
    usageContent = (
      <>
        <div className='grid gap-2 sm:grid-cols-3'>
          {usageQuery.data.totals.map((total) => (
            <div
              key={`${total.stage}-${total.status}`}
              className='border-border rounded-md border p-3 text-xs'
            >
              <div className='font-medium'>
                {total.stage} · {total.status}
              </div>
              <div className='text-muted-foreground mt-1'>
                {total.calls} calls · {total.totalTokens.toLocaleString()}{' '}
                tokens
              </div>
              <div className='mt-1'>
                ¥{Number(total.actualCostCny).toFixed(8)} cost · ¥
                {Number(total.userChargeCny).toFixed(8)} charge
              </div>
            </div>
          ))}
        </div>
        <div className='border-border overflow-auto rounded-md border'>
          <table className='w-full text-left text-xs'>
            <thead className='bg-muted/40'>
              <tr>
                <th className='p-2'>{t('Stage')}</th>
                <th className='p-2'>{t('Model')}</th>
                <th className='p-2'>{t('Tokens')}</th>
                <th className='p-2'>{t('Cost')}</th>
                <th className='p-2'>{t('Billing')}</th>
              </tr>
            </thead>
            <tbody>
              {usageQuery.data.entries.map((entry) => (
                <tr key={entry.ledgerId} className='border-border border-t'>
                  <td className='p-2'>{entry.stage}</td>
                  <td className='p-2'>{entry.model || '-'}</td>
                  <td className='p-2'>{entry.totalTokens.toLocaleString()}</td>
                  <td className='p-2'>
                    ¥{Number(entry.actualCostCny).toFixed(8)} → ¥
                    {Number(entry.userChargeCny).toFixed(8)}
                  </td>
                  <td className='p-2'>{entry.billingStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  const accountView = (
    <div className='space-y-6'>
      <section className='space-y-3'>
        <div>
          <h2 className='text-base font-semibold'>{t('Account learning')}</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t(
              'Inspect one account from captured evidence through reusable Preference MD.'
            )}
          </p>
        </div>
        <PrivateACUUserSelector
          options={userOptions}
          value={selectedUserId}
          searchValue={userSearch}
          loading={
            userSearch !== debouncedUserSearch ||
            userSearchQuery.isFetching ||
            usersQuery.isLoading
          }
          onSearchValueChange={setUserSearch}
          onValueChange={selectUser}
        />
        {draft && (
          <div className='border-border bg-muted/15 space-y-3 rounded-md border p-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <h3 className='text-sm font-semibold'>
                  {t('Private ACU system switch')}
                </h3>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t('This switch controls Private ACU for every account.')}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-4'>
                <label className='flex items-center gap-2 text-sm'>
                  <Switch
                    checked={draft.enabled}
                    disabled={runtimeMutation.isPending}
                    onCheckedChange={(enabled) =>
                      runtimeMutation.mutate({
                        enabled,
                        advisorReferenceEnabled: draft.advisorReferenceEnabled,
                        observerInterval: draft.observerInterval,
                      })
                    }
                  />
                  {t('Global Private ACU')}
                </label>
                <label className='flex items-center gap-2 text-sm'>
                  <Switch
                    checked={draft.advisorReferenceEnabled}
                    disabled={runtimeMutation.isPending}
                    onCheckedChange={(advisorReferenceEnabled) =>
                      runtimeMutation.mutate({
                        enabled: draft.enabled,
                        advisorReferenceEnabled,
                        observerInterval: draft.observerInterval,
                      })
                    }
                  />
                  {t('Global Advisor reference')}
                </label>
              </div>
            </div>
          </div>
        )}
        {selectedUserId && selectedConfig && (
          <div className='border-border space-y-3 rounded-md border p-4'>
            <div>
              <h3 className='text-sm font-semibold'>
                {t('Manage selected user')}
              </h3>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t(
                  'Administrators and the user edit the same account settings.'
                )}
              </p>
            </div>
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              {(
                [
                  ['learningEnabled', t('Account learning')],
                  ['observerEnabled', t('Observer')],
                  ['advisorEnabled', t('Advisor')],
                  ['injectionEnabled', t('Advisor reference')],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className='bg-muted/20 flex items-center justify-between gap-3 rounded-md border p-3 text-sm'
                >
                  {label}
                  <Switch
                    checked={selectedConfig[key]}
                    disabled={userConfigMutation.isPending}
                    onCheckedChange={(checked) =>
                      saveSelectedConfig({ [key]: checked })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className='space-y-2'>
          <div>
            <h3 className='text-sm font-semibold'>
              {t('Private ACU user status')}
            </h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'Users shown here have at least one Private ACU feature enabled. Select a user to inspect the existing account view.'
              )}
            </p>
          </div>
          <PrivateACUUserConfigTable
            configs={userConfigsQuery.data ?? []}
            users={usersQuery.data?.data?.items ?? []}
            loading={userConfigsQuery.isLoading}
            error={userConfigsQuery.isError}
            onSelect={selectUser}
          />
        </div>
        <div className='grid gap-3 sm:grid-cols-3'>
          <div className='border-border rounded-md border p-3'>
            <div className='text-muted-foreground text-xs'>
              {t('Learning space')}
            </div>
            <div className='mt-1 text-sm font-medium break-all'>
              {memoryQuery.data?.spaceId || t('Not created')}
            </div>
          </div>
          <div className='border-border rounded-md border p-3'>
            <div className='text-muted-foreground text-xs'>
              {t('Current Preference MD')}
            </div>
            <div className='mt-1 text-sm font-medium'>
              {memoryQuery.data?.skills.length ?? 0}
            </div>
          </div>
          <div className='border-border rounded-md border p-3'>
            <div className='text-muted-foreground text-xs'>
              {t('Active learning prompts')}
            </div>
            <div className='mt-1 text-sm font-medium'>
              {accountRuntimeCards.length}
            </div>
          </div>
        </div>
      </section>
      <section className='space-y-3'>
        <div>
          <h2 className='text-base font-semibold'>
            {t('Effective account learning prompts')}
          </h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t(
              'This read-only snapshot is resolved for the selected account Learning Space.'
            )}
          </p>
        </div>
        <RuntimePromptCardsSection
          cards={accountRuntimeCards}
          loading={promptsQuery.isLoading || memoryQuery.isLoading}
          error={promptsQuery.isError || memoryQuery.isError}
          emptyText={t('No account learning prompts')}
          collapsePrompt
        />
      </section>
      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>{t('Learning runs')}</h2>
        <PrivateACULearningRuns />
      </section>
      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>{t('Experiences')}</h2>
        <ExperiencesSection
          userId={selectedUserId}
          enabled={Boolean(selectedUserId)}
        />
      </section>
      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>{t('Acontext memory')}</h2>
        <MemorySection
          memory={memoryQuery.data}
          loading={memoryQuery.isLoading}
        />
      </section>
      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>{t('Advisor history')}</h2>
        <AdvisorHistorySection userId={selectedUserId} />
      </section>
      <section className='space-y-3'>
        <h2 className='text-base font-semibold'>
          {t('Private ACU usage and billing')}
        </h2>
        {usageContent}
      </section>
    </div>
  )

  const promptsView = (
    <div className='space-y-5'>
      <section className='space-y-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-base font-semibold'>
              {t('Prompt maintenance')}
            </h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Review the exact runtime prompts selected for each Learning Space and maintain editable Router prompts.'
              )}
            </p>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Version')}: {draft?.promptVersion ?? '-'} · {t('Source')}:{' '}
              {draft?.source ?? '-'}
            </p>
          </div>
          {draft && (
            <div className='border-border mt-4 rounded-md border p-3'>
              <div>
                <h3 className='text-sm font-semibold'>
                  {t('Private ACU supervision settings')}
                </h3>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t(
                    'Observer and Advisor are enabled and configured together here. The Observer interval controls how often this background review starts.'
                  )}
                </p>
              </div>
              <div className='mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm'>
                <div className='flex items-center gap-1.5'>
                  <label className='flex items-center gap-2'>
                    <Switch
                      checked={draft.enabled}
                      disabled={disabled || !canEdit}
                      onCheckedChange={(checked) =>
                        setDraft((current) =>
                          current ? { ...current, enabled: checked } : current
                        )
                      }
                    />
                    {t('Enable Observer and Advisor')}
                  </label>
                  <AdvisorSettingHint label={t('Advisor review information')}>
                    {t(
                      'Observer runs at the configured interval. Advisor runs only when Observer identifies a relevant issue. Both run asynchronously and do not change the task or execute actions.'
                    )}
                  </AdvisorSettingHint>
                </div>
                <div className='flex items-center gap-1.5'>
                  <label className='flex items-center gap-2'>
                    <Switch
                      checked={draft.advisorReferenceEnabled}
                      disabled={disabled || !canEdit}
                      onCheckedChange={(checked) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                advisorReferenceEnabled: checked,
                              }
                            : current
                        )
                      }
                    />
                    {t('Insert Advisor reference automatically')}
                  </label>
                  <AdvisorSettingHint
                    label={t('Advisor reference information')}
                  >
                    {t(
                      'Adds the Advisor result to the same session’s next LLM request as non-authoritative context. It reflects preferences and past experience, not instructions; the model decides how to use it.'
                    )}
                  </AdvisorSettingHint>
                </div>
                <div className='flex items-center gap-1.5'>
                  <label className='flex items-center gap-2'>
                    <span className='text-muted-foreground'>
                      {t('Observer interval')}
                    </span>
                    <Input
                      type='number'
                      min={1}
                      max={100000}
                      step={1}
                      className='w-24'
                      value={draft.observerInterval}
                      disabled={disabled || !canEdit}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                observerInterval: Number(event.target.value),
                              }
                            : current
                        )
                      }
                    />
                  </label>
                  <AdvisorSettingHint
                    label={t('Observer interval information')}
                  >
                    {t(
                      'Starts one Observer review after this many completed model calls. The default is 20, and administrators can change it.'
                    )}
                  </AdvisorSettingHint>
                </div>
              </div>
            </div>
          )}
          {canEdit && (
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={disabled}
                onClick={() => resetMutation.mutate()}
              >
                <RotateCcw />
                {t('Reset default')}
              </Button>
              <Button
                size='sm'
                disabled={disabled || !editable}
                onClick={() => editable && saveMutation.mutate(editable)}
              >
                <Save />
                {t('Save prompts')}
              </Button>
            </div>
          )}
        </div>
      </section>
      <Tabs defaultValue='account' className='min-w-0 gap-4'>
        <TabsList>
          <TabsTrigger value='account'>{t('Account learning')}</TabsTrigger>
          <TabsTrigger value='film'>{t('Film POC / GYZ')}</TabsTrigger>
          <TabsTrigger value='supervision'>
            {t('Process supervision')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='account' className='space-y-4'>
          <div>
            <h3 className='text-sm font-semibold'>
              {t('Account learning runtime prompts')}
            </h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'The current path executes Learning Judge, dissatisfaction distillation, and Preference MD learning in this order.'
              )}
            </p>
          </div>
          <RuntimePromptCardsSection
            cards={accountRuntimeCards}
            loading={promptsQuery.isLoading || memoryQuery.isLoading}
            error={promptsQuery.isError || memoryQuery.isError}
            emptyText={t('No account learning prompts')}
          />
          {canEdit && editable ? (
            <details className='border-border rounded-md border p-4'>
              <summary className='cursor-pointer text-sm font-medium'>
                {t('Edit Learning Judge configuration')}
              </summary>
              <p className='text-muted-foreground mt-2 text-xs'>
                {t(
                  'Edits remain a draft until Save prompts succeeds. Runtime cards above always show the saved prompt.'
                )}
              </p>
              <div className='mt-4'>
                <PromptEditor
                  label={t('Learning prompt draft')}
                  value={editable.learningPrompt}
                  disabled={disabled}
                  onChange={(value) =>
                    setDraft((current) =>
                      current ? { ...current, learningPrompt: value } : current
                    )
                  }
                />
              </div>
            </details>
          ) : null}
          {bypassedAccountCards.length ? (
            <details className='border-border rounded-md border p-4'>
              <summary className='cursor-pointer text-sm font-medium'>
                {t('Configured Acontext steps not executed by active learning')}
              </summary>
              <p className='text-muted-foreground mt-2 text-xs'>
                {t(
                  'These prompts remain part of Acontext, but the explicit Private ACU learning adapter bypasses them.'
                )}
              </p>
              <div className='mt-4'>
                <RuntimePromptCardsSection
                  cards={bypassedAccountCards}
                  loading={false}
                  error={false}
                  emptyText={t('No bypassed prompts')}
                />
              </div>
            </details>
          ) : null}
        </TabsContent>
        <TabsContent value='film' className='space-y-4'>
          <div>
            <h3 className='text-sm font-semibold'>{t('Film POC prompts')}</h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'Read-only runtime prompts resolved from the GYZ Learning Space.'
              )}
            </p>
          </div>
          <RuntimePromptCardsSection
            cards={filmPromptsQuery.data?.promptCards}
            loading={filmPromptsQuery.isLoading}
            error={filmPromptsQuery.isError}
            emptyText={t('No film prompts')}
          />
        </TabsContent>
        <TabsContent value='supervision' className='space-y-4'>
          <div>
            <h3 className='text-sm font-semibold'>
              {t('Observer and Advisor prompts')}
            </h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'These Router prompts supervise the process independently from account and film learning.'
              )}
            </p>
          </div>
          {editable ? (
            <div className='grid gap-4 lg:grid-cols-2'>
              <PromptEditor
                label={t('Observer prompt')}
                value={editable.observerPrompt}
                disabled={disabled || !canEdit}
                onChange={(value) =>
                  setDraft((current) =>
                    current ? { ...current, observerPrompt: value } : current
                  )
                }
              />
              <PromptEditor
                label={t('Advisor prompt')}
                value={editable.advisorPrompt}
                disabled={disabled || !canEdit}
                onChange={(value) =>
                  setDraft((current) =>
                    current ? { ...current, advisorPrompt: value } : current
                  )
                }
              />
            </div>
          ) : (
            <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
          )}
        </TabsContent>
      </Tabs>
      {canEdit ? (
        <details className='border-border rounded-md border p-4'>
          <summary className='flex cursor-pointer items-center gap-2 text-sm font-medium'>
            <Braces className='size-4' aria-hidden='true' />
            {t('Acontext implementation source (developer reference)')}
          </summary>
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'These Python files implement prompt selection. They are source reference, not the final runtime prompt shown above.'
            )}
          </p>
          <div className='mt-4'>
            <AcontextSourceFiles files={memoryQuery.data?.internalPrompts} />
          </div>
        </details>
      ) : null}
    </div>
  )

  if (props.view === 'account') return accountView
  if (props.view === 'prompts') return promptsView

  return (
    <Tabs defaultValue='accounts' className='min-w-0 gap-5'>
      <TabsList>
        <TabsTrigger value='accounts'>{t('Account learning')}</TabsTrigger>
        <TabsTrigger value='film'>{t('Film POC / GYZ')}</TabsTrigger>
      </TabsList>
      <TabsContent value='accounts' className='min-w-0'>
        {accountView}
      </TabsContent>
      <TabsContent value='film' className='min-w-0'>
        <div className='space-y-6'>
          <PrivateACUFilmPOC />
          <section className='space-y-3'>
            <h2 className='text-base font-semibold'>
              {t('Film learning runs')}
            </h2>
            <PrivateACULearningRuns learningKind='film_preference_v1' />
          </section>
        </div>
      </TabsContent>
    </Tabs>
  )
}

function ExperiencesSection(props: { userId?: string; enabled: boolean }) {
  const { t } = useTranslation()
  const [selectedExperienceId, setSelectedExperienceId] = useState<string>()
  const query = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'experiences', props.userId],
    queryFn: () => getPrivateACUExperiences(props.userId ?? ''),
    enabled: props.enabled,
  })
  const detailQuery = useQuery({
    queryKey: [
      'dashboard',
      'private-acu-admin',
      'experience-detail',
      props.userId,
      selectedExperienceId,
    ],
    queryFn: () =>
      getPrivateACUExperienceDetail(
        props.userId ?? '',
        selectedExperienceId ?? ''
      ),
    enabled: Boolean(props.userId && selectedExperienceId),
  })
  useEffect(() => setSelectedExperienceId(undefined), [props.userId])
  if (query.isLoading) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (query.isError) {
    return (
      <div className='text-muted-foreground text-sm'>{t('Failed to load')}</div>
    )
  }
  if (!query.data?.length) {
    return (
      <div className='text-muted-foreground text-sm'>{t('No experiences')}</div>
    )
  }
  let detailContent = (
    <div className='text-muted-foreground'>{t('No details')}</div>
  )
  if (detailQuery.isLoading) {
    detailContent = <div className='text-muted-foreground'>{t('Loading')}</div>
  } else if (detailQuery.isError) {
    detailContent = (
      <div className='text-destructive'>{t('Failed to load')}</div>
    )
  } else if (detailQuery.data) {
    detailContent = (
      <div className='space-y-2'>
        <div className='font-medium'>
          {t('Experience detail')}: {selectedExperienceId}
        </div>
        {detailQuery.data.advisor && (
          <div className='space-y-1'>
            <div>
              {t('Advisor')}: {detailQuery.data.advisor.status}
            </div>
            <div>
              {t('Problem')}: {detailQuery.data.advisor.problem || '-'}
            </div>
            <div>
              {t('Advice')}: {detailQuery.data.advisor.advice || '-'}
            </div>
          </div>
        )}
        <div className='overflow-auto'>
          <table className='w-full text-left'>
            <thead className='bg-muted/40'>
              <tr>
                <th className='p-1'>{t('Stage')}</th>
                <th className='p-1'>{t('Status')}</th>
                <th className='p-1'>{t('Model')}</th>
                <th className='p-1'>{t('Tokens')}</th>
                <th className='p-1'>{t('Cost')}</th>
              </tr>
            </thead>
            <tbody>
              {detailQuery.data.ledger.map((entry) => (
                <tr key={entry.ledgerId} className='border-border border-t'>
                  <td className='p-1'>{entry.stage}</td>
                  <td className='p-1'>{entry.status}</td>
                  <td className='p-1'>{entry.model || '-'}</td>
                  <td className='p-1'>{entry.totalTokens.toLocaleString()}</td>
                  <td className='p-1'>
                    ¥{Number(entry.actualCostCny).toFixed(8)} → ¥
                    {Number(entry.userChargeCny).toFixed(8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  return (
    <div className='border-border rounded-md border'>
      <div className='overflow-auto'>
        <table className='w-full text-left text-xs'>
          <thead className='bg-muted/40'>
            <tr>
              <th className='p-2'>{t('Experience')}</th>
              <th className='p-2'>{t('Time')}</th>
              <th className='p-2'>{t('Learning')}</th>
              <th className='p-2'>{t('Advisor')}</th>
              <th className='p-2'>{t('Problem')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((experience) => (
              <tr
                key={experience.experienceId}
                className='border-border border-t align-top'
              >
                <td className='p-2 font-mono'>
                  <button
                    type='button'
                    className='text-primary underline-offset-2 hover:underline'
                    onClick={() =>
                      setSelectedExperienceId((current) =>
                        current === experience.experienceId
                          ? undefined
                          : experience.experienceId
                      )
                    }
                  >
                    {experience.experienceId}
                  </button>
                </td>
                <td className='p-2 whitespace-nowrap'>
                  {new Date(experience.createdAt).toLocaleString()}
                </td>
                <td className='p-2'>
                  {experience.learningSuccesses}/{experience.learningCalls}
                </td>
                <td className='p-2'>
                  {experience.advisor?.needAdvisor
                    ? experience.advisor.status
                    : '-'}
                </td>
                <td className='p-2'>{experience.advisor?.problem || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedExperienceId && (
        <div className='border-border border-t p-3 text-xs'>
          {detailContent}
        </div>
      )}
    </div>
  )
}

function AdvisorHistorySection(props: { userId: string }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'advisors', props.userId],
    queryFn: () => getPrivateACUAdvisors(props.userId),
    enabled: Boolean(props.userId),
  })
  let content = (
    <div className='text-muted-foreground text-sm'>{t('No advisors')}</div>
  )
  if (query.isLoading || query.isFetching) {
    content = (
      <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
    )
  } else if (query.data?.length) {
    content = (
      <div className='border-border overflow-auto rounded-md border'>
        <table className='w-full text-left text-xs'>
          <thead className='bg-muted/40'>
            <tr>
              <th className='p-2'>{t('Time')}</th>
              <th className='p-2'>{t('Status')}</th>
              <th className='p-2'>{t('Problem')}</th>
              <th className='p-2'>{t('Advice')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((advisor) => (
              <tr
                key={advisor.advisorId}
                className='border-border border-t align-top'
              >
                <td className='p-2 whitespace-nowrap'>
                  {new Date(advisor.createdAt).toLocaleString()}
                </td>
                <td className='p-2'>
                  {advisor.needAdvisor ? advisor.status : '-'}
                </td>
                <td className='p-2'>{advisor.problem || '-'}</td>
                <td className='p-2'>{advisor.advice || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return <div className='space-y-3'>{content}</div>
}

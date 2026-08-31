import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { getUsers } from '@/features/users/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getPrivateACUMemory,
  getPrivateACUPrompts,
  resetPrivateACUPrompts,
  savePrivateACUPrompts,
  type PrivateACUMemory,
  type PrivateACUPrompts,
  getPrivateACUUsage,
  getPrivateACUExperiences,
  getPrivateACUExperienceDetail,
  getPrivateACUAdvisors,
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

function InternalPromptsSection(props: {
  prompts?: PrivateACUMemory['internalPrompts']
}) {
  const { t } = useTranslation()
  if (!props.prompts) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Acontext internal prompts are unavailable')}
      </p>
    )
  }
  return (
    <div className='space-y-3'>
      {props.prompts.map((prompt) => (
        <details
          key={prompt.path}
          className='border-border rounded-md border p-3'
        >
          <summary className='cursor-pointer font-mono text-xs'>
            {prompt.path}
          </summary>
          <pre className='bg-muted/30 mt-3 max-h-[32rem] overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap'>
            {prompt.content}
          </pre>
        </details>
      ))}
    </div>
  )
}

export function PrivateACUAdmin() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userRole = useAuthStore((state) => state.auth.user?.role)
  const canEdit = userRole === ROLE.SUPER_ADMIN
  const [draft, setDraft] = useState<PrivateACUPrompts>()
  const [selectedUserId, setSelectedUserId] = useState('')
  const usersQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'users'],
    queryFn: () =>
      getUsers({ page_size: 100, sort_by: 'id', sort_order: 'asc' }),
  })
  const promptsQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'prompts'],
    queryFn: getPrivateACUPrompts,
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
  const disabled = saveMutation.isPending || resetMutation.isPending
  const editable = draft
    ? {
        observerPrompt: draft.observerPrompt,
        advisorPrompt: draft.advisorPrompt,
        learningPrompt: draft.learningPrompt,
        enabled: draft.enabled,
      }
    : undefined
  const userOptions = (usersQuery.data?.data?.items ?? []).map((user) => ({
    value: String(user.id),
    label: `${user.username} · #${user.id}`,
  }))
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
      <section className='space-y-2'>
        <h2 className='text-base font-semibold'>{t('Account')}</h2>
        <Combobox
          options={userOptions}
          value={selectedUserId}
          onValueChange={(value) => setSelectedUserId(value ?? '')}
          placeholder={t('Select a user')}
          emptyText={t('No users found')}
          allowCustomValue
          className='max-w-md'
        />
      </section>
      <section className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-base font-semibold'>
              {t('Private ACU prompts')}
            </h2>
            <p className='text-muted-foreground text-xs'>
              {t('Version')}: {draft?.promptVersion ?? '-'} · {t('Source')}:{' '}
              {draft?.source ?? '-'}
            </p>
          </div>
          {draft && (
            <label className='flex items-center gap-2 text-sm'>
              <Switch
                checked={draft.enabled}
                disabled={disabled || !canEdit}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    current ? { ...current, enabled: checked } : current
                  )
                }
              />
              {t('Private ACU enabled')}
            </label>
          )}
          <div className='flex gap-2'>
            {canEdit && (
              <>
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
              </>
            )}
          </div>
        </div>
        {editable ? (
          <div className='grid gap-4'>
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
            <PromptEditor
              label={t('Learning prompt')}
              value={editable.learningPrompt}
              disabled={disabled || !canEdit}
              onChange={(value) =>
                setDraft((current) =>
                  current ? { ...current, learningPrompt: value } : current
                )
              }
            />
          </div>
        ) : (
          <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
        )}
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
        <h2 className='text-base font-semibold'>
          {t('Private ACU usage and billing')}
        </h2>
        {usageContent}
      </section>
      <section className='border-border space-y-2 rounded-md border p-4'>
        <h2 className='text-base font-semibold'>
          {t('Acontext internal prompts')}
        </h2>
        <InternalPromptsSection prompts={memoryQuery.data?.internalPrompts} />
      </section>
    </div>
  )

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
            <h2 className='text-base font-semibold'>{t('Film learning runs')}</h2>
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

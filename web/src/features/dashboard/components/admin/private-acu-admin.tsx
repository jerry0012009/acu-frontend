import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getPrivateACUMemory,
  getPrivateACUPrompts,
  resetPrivateACUPrompts,
  savePrivateACUPrompts,
  type PrivateACUMemory,
  type PrivateACUPrompts,
} from '../../private-acu-admin-api'

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
  if (props.loading) return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  if (!props.memory?.enabled) {
    return <div className='text-muted-foreground text-sm'>{t('Acontext is not configured')}</div>
  }
  return (
    <div className='space-y-3'>
      <div className='text-muted-foreground text-xs'>
        {t('Learning space')}: {props.memory.spaceId || t('Not created')}
      </div>
      {props.memory.skills.map((skill) => (
        <details key={skill.id} className='border-border rounded-md border p-3'>
          <summary className='flex cursor-pointer list-none items-center gap-2 text-sm font-medium'>
            <ChevronDown className='size-4' />
            {skill.name}
            <span className='text-muted-foreground text-xs'>{skill.description}</span>
          </summary>
          <div className='mt-3 space-y-3'>
            {skill.files.map((file) => (
              <details key={file.path} className='bg-muted/30 rounded-md p-3'>
                <summary className='cursor-pointer font-mono text-xs'>{file.path}</summary>
                <pre className='mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs'>
                  {file.content || t('No content')}
                </pre>
              </details>
            ))}
          </div>
        </details>
      ))}
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
        <details key={prompt.path} className='border-border rounded-md border p-3'>
          <summary className='cursor-pointer font-mono text-xs'>{prompt.path}</summary>
          <pre className='bg-muted/30 mt-3 max-h-[32rem] overflow-auto rounded-md p-3 whitespace-pre-wrap text-xs'>
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
  const promptsQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'prompts'],
    queryFn: getPrivateACUPrompts,
  })
  const memoryQuery = useQuery({
    queryKey: ['dashboard', 'private-acu-admin', 'memory'],
    queryFn: getPrivateACUMemory,
  })
  useEffect(() => {
    if (promptsQuery.data) setDraft(promptsQuery.data)
  }, [promptsQuery.data])
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
      }
    : undefined

  return (
    <div className='space-y-6'>
      <section className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='text-base font-semibold'>{t('Private ACU prompts')}</h2>
            <p className='text-muted-foreground text-xs'>
              {t('Version')}: {draft?.promptVersion ?? '-'} · {t('Source')}:{' '}
              {draft?.source ?? '-'}
            </p>
          </div>
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
        <MemorySection memory={memoryQuery.data} loading={memoryQuery.isLoading} />
      </section>
      <section className='border-border space-y-2 rounded-md border p-4'>
        <h2 className='text-base font-semibold'>{t('Acontext internal prompts')}</h2>
        <InternalPromptsSection prompts={memoryQuery.data?.internalPrompts} />
      </section>
    </div>
  )
}

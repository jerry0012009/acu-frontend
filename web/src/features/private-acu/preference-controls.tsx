import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Pause, Play, X, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

type RecordControl = {
  id: string
  summary: string
  scope: string
  rule?: string
  exceptions?: string
  disabled: boolean
  revision: string
  original?: {
    summary: string
    scope: string
    rule?: string
    exceptions?: string
  }
}

export function PreferenceControls() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const client = useQueryClient()
  const [editing, setEditing] = useState<RecordControl | null>(null)
  const [search, setSearch] = useState('')
  useEffect(() => {
    setEditing(null)
    setSearch('')
  }, [userId])
  const query = useQuery({
    queryKey: ['private-acu', 'preference-controls', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<RecordControl[]> => {
      const response = await api.get('/api/user/self/acu-preference-controls')
      if (!response.data.success) throw new Error('Preferences unavailable')
      return response.data.data.records
    },
  })
  const mutation = useMutation({
    mutationFn: async (change: { record: RecordControl; action: string }) => {
      const fields: Record<string, string> = {}
      if (change.action === 'edit') {
        for (const key of ['summary', 'scope', 'rule', 'exceptions'] as const) {
          if (
            (change.record[key] ?? '') !== (change.record.original?.[key] ?? '')
          ) {
            fields[key] = change.record[key] ?? ''
          }
        }
      }
      const response = await api.put(
        `/api/user/self/acu-preference-controls/${encodeURIComponent(change.record.id)}`,
        change.action === 'edit'
          ? {
              action: change.action,
              ...fields,
              expected_hash: change.record.revision,
            }
          : { action: change.action, expected_hash: change.record.revision }
      )
      if (!response.data.success) throw new Error('Preference update failed')
    },
    onSuccess: async () => {
      setEditing(null)
      await client.invalidateQueries({ queryKey: ['private-acu'] })
    },
  })
  return (
    <section
      aria-label={t('Saved preference records')}
      className='min-w-0 space-y-3'
    >
      <h2 className='text-base font-semibold'>{t('Manage preferences')}</h2>
      <Input
        type='search'
        aria-label={t('Search preferences')}
        placeholder={t('Search preferences')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {query.isPending && <p role='status'>{t('Loading')}</p>}
      {(query.isError || mutation.isError) && (
        <p role='alert'>
          {t('Preference changed or unavailable. Refresh and retry.')}
        </p>
      )}
      {query.data &&
        !query.data.some((record) =>
          record.summary.toLowerCase().includes(search.toLowerCase())
        ) && <p>{t('No matching preferences')}</p>}
      <ul className='divide-y'>
        {query.data
          ?.filter((record) =>
            record.summary.toLowerCase().includes(search.toLowerCase())
          )
          .map((record) => (
            <li key={record.id} className='space-y-2 py-3'>
              {editing?.id === record.id ? (
                <form
                  className='space-y-2'
                  onSubmit={(event) => {
                    event.preventDefault()
                    mutation.mutate({ record: editing, action: 'edit' })
                  }}
                >
                  <label className='block text-sm'>
                    {t('Preference summary')}
                    <Input
                      required
                      maxLength={400}
                      value={editing.summary}
                      onChange={(event) =>
                        setEditing({ ...editing, summary: event.target.value })
                      }
                    />
                  </label>
                  <label className='block text-sm'>
                    {t('Applies when')}
                    <Textarea
                      maxLength={30000}
                      value={editing.scope}
                      onChange={(event) =>
                        setEditing({ ...editing, scope: event.target.value })
                      }
                    />
                  </label>
                  <label className='block text-sm'>
                    {t('Preference rule')}
                    <Textarea
                      maxLength={30000}
                      value={editing.rule ?? ''}
                      onChange={(event) =>
                        setEditing({ ...editing, rule: event.target.value })
                      }
                    />
                  </label>
                  <label className='block text-sm'>
                    {t('Exceptions')}
                    <Textarea
                      maxLength={30000}
                      value={editing.exceptions ?? ''}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          exceptions: event.target.value,
                        })
                      }
                    />
                  </label>
                  <Button
                    type='submit'
                    size='icon'
                    title={t('Save')}
                    aria-label={t('Save')}
                    disabled={mutation.isPending}
                  >
                    <Check />
                  </Button>
                  <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    title={t('Cancel')}
                    aria-label={t('Cancel')}
                    onClick={() => setEditing(null)}
                  >
                    <X />
                  </Button>
                </form>
              ) : (
                <div className='flex items-start gap-3'>
                  <div className='min-w-0 flex-1 text-sm leading-6 [overflow-wrap:anywhere]'>
                    <p>{record.summary}</p>
                    {record.scope && (
                      <p className='text-muted-foreground'>{record.scope}</p>
                    )}
                    {record.disabled && (
                      <span className='text-muted-foreground'>
                        {t('Paused')}
                      </span>
                    )}
                  </div>
                  <Button
                    size='icon'
                    variant='ghost'
                    title={t('Edit preference')}
                    aria-label={t('Edit preference')}
                    disabled={mutation.isPending}
                    onClick={() =>
                      setEditing({ ...record, original: { ...record } })
                    }
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    title={
                      record.disabled
                        ? t('Restore preference')
                        : t('Pause preference')
                    }
                    aria-label={
                      record.disabled
                        ? t('Restore preference')
                        : t('Pause preference')
                    }
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        record,
                        action: record.disabled ? 'restore' : 'disable',
                      })
                    }
                  >
                    {record.disabled ? <Play /> : <Pause />}
                  </Button>
                </div>
              )}
            </li>
          ))}
      </ul>
    </section>
  )
}

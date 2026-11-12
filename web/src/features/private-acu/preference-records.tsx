import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth-store'

import {
  getPreferenceLibrary,
  type PreferenceRecord,
} from './preference-library-api'

export function PreferenceRecordList(props: {
  records: PreferenceRecord[]
  sourceIds?: string[]
  searchable?: boolean
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const selected = props.sourceIds
    ? props.records.filter((record) => props.sourceIds?.includes(record.id))
    : props.records
  const records = selected.filter((record) =>
    record.summary
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  )
  return (
    <div className='min-w-0'>
      {props.searchable && (
        <Input
          type='search'
          className='mt-3 max-w-md'
          aria-label={t('Search preferences')}
          placeholder={t('Search preferences')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      {records.length ? (
        <ul className='divide-border divide-y'>
          {records.map((record) => (
            <li
              key={record.id}
              className='py-3 text-sm leading-6 [overflow-wrap:anywhere]'
            >
              {record.summary}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-muted-foreground py-3 text-sm'>
          {search
            ? t('No matching preferences')
            : t('No readable preference records available')}
        </p>
      )}
      {props.sourceIds &&
        selected.length < props.sourceIds.length &&
        selected.length > 0 && (
          <p className='text-muted-foreground text-xs'>
            {t('Some source records have no readable summary')}
          </p>
        )}
    </div>
  )
}

export function PreferenceRecords(props: {
  sourceIds?: string[]
  searchable?: boolean
}) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const query = useQuery({
    queryKey: ['private-acu', 'preference-library', userId],
    queryFn: getPreferenceLibrary,
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: false,
  })
  if (query.isLoading) return <p role='status'>{t('Loading')}</p>
  if (query.isError) {
    return (
      <div role='status' className='flex items-center gap-2 text-sm'>
        {t('Preference records unavailable')}
        <Button
          size='icon'
          variant='ghost'
          aria-label={t('Retry')}
          title={t('Retry')}
          onClick={() => void query.refetch()}
        >
          <RefreshCw />
        </Button>
      </div>
    )
  }
  return (
    <PreferenceRecordList
      records={query.data?.records ?? []}
      sourceIds={props.sourceIds}
      searchable={props.searchable}
    />
  )
}

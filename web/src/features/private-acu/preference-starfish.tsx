import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Minus, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { getPrivateACUMemory } from '@/features/dashboard/advisor-api'

import { preferenceDisplayText } from './preference-display'
import {
  getPreferenceProfile,
  type PreferenceProfileView,
} from './preference-profile-api'

const COLORS = [
  '#059669',
  '#0284c7',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#dc2626',
  '#0d9488',
  '#657b25',
]

export function PreferenceStarfishChart(props: {
  view: PreferenceProfileView
}) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState('')
  const [zoom, setZoom] = useState(1)
  const rays = props.view.profile?.rays ?? []
  const selected = rays.find((ray) => ray.id === selectedId) ?? rays[0]
  const categories = [...new Set(rays.map((ray) => ray.category))].sort()
  const memory = useQuery({
    queryKey: ['private-acu', 'self-memory'],
    queryFn: getPrivateACUMemory,
    enabled: Boolean(selected?.id),
    staleTime: 30_000,
    retry: false,
  })
  const points = rays.map((ray, index) => {
    const angle = (index * Math.PI * 2) / rays.length - Math.PI / 2
    const radius = 45 + (ray.score / 100) * 205
    return {
      ray,
      x: 320 + Math.cos(angle) * radius,
      y: 320 + Math.sin(angle) * radius,
      outerX: 320 + Math.cos(angle) * 270,
      outerY: 320 + Math.sin(angle) * 270,
      color: COLORS[categories.indexOf(ray.category) % COLORS.length],
    }
  })
  return (
    <div className='min-w-0 space-y-4'>
      <div className='flex flex-wrap items-center gap-x-5 gap-y-2 text-xs'>
        {categories.map((category, index) => (
          <span key={category} className='flex items-center gap-2 break-words'>
            <span
              className='size-2.5 shrink-0 rounded-full'
              style={{ background: COLORS[index % COLORS.length] }}
            />
            {category}
          </span>
        ))}
      </div>
      <div className='grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]'>
        <div className='min-w-0'>
          <div className='flex justify-end gap-1'>
            <Button
              size='icon'
              variant='ghost'
              disabled={zoom <= 1}
              title={t('Zoom out')}
              aria-label={t('Zoom out')}
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            >
              <Minus />
            </Button>
            <Button
              size='icon'
              variant='ghost'
              disabled={zoom >= 2.5}
              title={t('Zoom in')}
              aria-label={t('Zoom in')}
              onClick={() => setZoom(Math.min(2.5, zoom + 0.5))}
            >
              <Plus />
            </Button>
          </div>
          <div
            className='aspect-square w-full overflow-auto'
            data-testid='preference-chart-viewport'
          >
            <svg
              viewBox='0 0 640 640'
              role='group'
              aria-label={t('Preference starfish')}
              style={{
                width: `${zoom * 100}%`,
                height: `${zoom * 100}%`,
                maxWidth: 'none',
              }}
            >
              {[45, 96, 147, 198, 250].map((radius) => (
                <circle
                  key={radius}
                  cx='320'
                  cy='320'
                  r={radius}
                  fill='none'
                  stroke='currentColor'
                  opacity='.09'
                />
              ))}
              {points.length > 2 && (
                <polygon
                  points={points
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                  fill='#059669'
                  fillOpacity='.07'
                  stroke='#059669'
                  strokeOpacity='.2'
                />
              )}
              {points.map((point, index) => (
                <g
                  key={point.ray.id}
                  role='button'
                  tabIndex={0}
                  aria-label={point.ray.label}
                  aria-pressed={selected?.id === point.ray.id}
                  onClick={() => setSelectedId(point.ray.id)}
                  onFocus={() => setSelectedId(point.ray.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedId(point.ray.id)
                    }
                  }}
                  className='cursor-pointer focus:outline-none'
                >
                  <title>{`${point.ray.label}: ${point.ray.summary}`}</title>
                  <line
                    x1='320'
                    y1='320'
                    x2={point.outerX}
                    y2={point.outerY}
                    stroke='currentColor'
                    strokeOpacity='.1'
                  />
                  <line
                    x1='320'
                    y1='320'
                    x2={point.x}
                    y2={point.y}
                    stroke={point.color}
                    strokeWidth={selected?.id === point.ray.id ? 4 : 2}
                    opacity={0.35 + (point.ray.confidence / 100) * 0.65}
                  />
                  <line
                    x1='320'
                    y1='320'
                    x2={point.outerX}
                    y2={point.outerY}
                    stroke='transparent'
                    strokeWidth='10'
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={selected?.id === point.ray.id ? 6 : 3.5}
                    fill={point.color}
                  />
                  <text
                    x={point.outerX}
                    y={point.outerY}
                    dy='4'
                    textAnchor='middle'
                    fontSize='10'
                    fill='currentColor'
                  >
                    {index + 1}
                  </text>
                </g>
              ))}
              <circle cx='320' cy='320' r='32' className='fill-background' />
              <text
                x='320'
                y='318'
                textAnchor='middle'
                fontSize='18'
                fontWeight='600'
                fill='currentColor'
              >
                {rays.length}
              </text>
              <text
                x='320'
                y='335'
                textAnchor='middle'
                fontSize='10'
                fill='currentColor'
              >
                {t('Preferences')}
              </text>
            </svg>
          </div>
        </div>
        <div className='min-w-0 space-y-4 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5'>
          {selected && (
            <article className='space-y-3 break-words'>
              <div className='text-muted-foreground text-xs'>
                {selected.category}
              </div>
              <h3 className='text-base font-semibold'>{selected.label}</h3>
              <p className='text-sm leading-6'>{selected.summary}</p>
              {selected.scope && (
                <p className='text-muted-foreground text-xs leading-5'>
                  {selected.scope}
                </p>
              )}
              <dl className='grid grid-cols-2 gap-3 text-xs'>
                <div>
                  <dt>{t('Preference strength estimate')}</dt>
                  <dd className='mt-1 text-lg tabular-nums'>
                    {selected.score}/100
                  </dd>
                </div>
                <div>
                  <dt>{t('Evidence confidence estimate')}</dt>
                  <dd className='mt-1 text-lg tabular-nums'>
                    {selected.confidence}/100
                  </dd>
                </div>
              </dl>
              <details
                onToggle={(event) => {
                  if (event.currentTarget.open) setSelectedId(selected.id)
                }}
              >
                <summary className='cursor-pointer text-xs'>
                  {t('Source documents')} ({selected.sourceIds.length})
                </summary>
                {memory.isLoading && (
                  <LoaderCircle className='mt-2 size-4 animate-spin' />
                )}
                {memory.isError && (
                  <p className='mt-2 text-xs'>
                    {t('Source documents unavailable')}
                  </p>
                )}
                {selected.sourceIds.map((id) => {
                  const source = memory.data?.skills.find(
                    (item) => item.id === id
                  )
                  return (
                    <div key={id} className='mt-3 border-t pt-2 text-xs'>
                      <p className='font-medium break-all'>
                        {source?.name ?? id}
                      </p>
                      {source?.files.map((file) => (
                        <pre
                          key={file.path}
                          className='mt-2 max-h-60 overflow-auto leading-5 break-words whitespace-pre-wrap'
                        >
                          {preferenceDisplayText(file.content ?? '')}
                        </pre>
                      ))}
                    </div>
                  )
                })}
              </details>
            </article>
          )}
          <ol className='max-h-64 overflow-y-auto border-t pt-3'>
            {rays.map((ray, index) => (
              <li key={ray.id}>
                <button
                  type='button'
                  aria-pressed={selected?.id === ray.id}
                  className='hover:bg-muted aria-pressed:bg-muted flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-xs'
                  onClick={() => setSelectedId(ray.id)}
                >
                  <span className='text-muted-foreground w-6 shrink-0 tabular-nums'>
                    {index + 1}
                  </span>
                  <span className='min-w-0 break-words'>{ray.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

export function PreferenceStarfish() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['private-acu', 'preference-profile'],
    queryFn: getPreferenceProfile,
    refetchInterval: 10_000,
    retry: false,
  })
  const view = query.data
  const pending = view?.status === 'queued' || view?.status === 'generating'
  return (
    <section
      className='min-w-0 space-y-4 border-b pb-6'
      aria-label={t('Preference starfish')}
    >
      <header className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='text-lg font-semibold'>
            {t('Your preference starfish')}
          </h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('{{count}} source documents', {
              count: view?.profile?.sourceCount ?? 0,
            })}
            {view?.generatedAt && (
              <> · {new Date(view.generatedAt).toLocaleString()}</>
            )}
          </p>
        </div>
        <Button
          size='icon'
          variant='ghost'
          title={t('Refresh')}
          aria-label={t('Refresh')}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
        </Button>
      </header>
      {(query.isLoading || pending) && (
        <p
          role='status'
          className='text-muted-foreground flex items-center gap-2 text-sm'
        >
          <LoaderCircle className='size-4 animate-spin' />
          {t('Updating preference starfish')}
        </p>
      )}
      {(query.isError || view?.status === 'error') && (
        <p role='status' className='text-sm text-amber-700 dark:text-amber-400'>
          {t('Preference refresh unavailable. Last saved profile is retained.')}
        </p>
      )}
      {view?.profile?.summary && (
        <p className='max-w-4xl text-sm leading-6 break-words'>
          {view.profile.summary}
        </p>
      )}
      {view && Boolean(view.profile?.rays.length) && (
        <PreferenceStarfishChart view={view} />
      )}
      {view?.status === 'empty' && (
        <p className='text-muted-foreground py-12 text-center text-sm'>
          {t('No learned preferences yet')}
        </p>
      )}
      {Boolean(view?.profile?.excluded.length) && (
        <details className='text-muted-foreground text-xs'>
          <summary className='cursor-pointer'>
            {t('Documents without reusable preferences')} (
            {view?.profile?.excluded.length})
          </summary>
          {view?.profile?.excluded.map((item) => (
            <p key={item.sourceId} className='mt-2 break-words'>
              {item.reason}
            </p>
          ))}
        </details>
      )}
    </section>
  )
}

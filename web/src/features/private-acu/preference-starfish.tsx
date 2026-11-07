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

const STARFISH_CSS = `
  @keyframes preference-starfish-pulse {
    0%, 100% { opacity: .28; transform: scale(.82); }
    50% { opacity: .72; transform: scale(1.08); }
  }
  @keyframes preference-starfish-scan {
    0% { stroke-dashoffset: 520; opacity: 0; }
    18%, 72% { opacity: .8; }
    100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes preference-starfish-core {
    0%, 100% { opacity: .6; }
    50% { opacity: 1; }
  }
  .preference-starfish-pulse { animation: preference-starfish-pulse 3.8s ease-in-out infinite; transform-origin: 320px 320px; }
  .preference-starfish-core { animation: preference-starfish-core 2.4s ease-in-out infinite; }
  .preference-starfish-scan { stroke-dasharray: 120 400; animation: preference-starfish-scan 4.8s cubic-bezier(.4,0,.2,1) infinite; }
  .preference-starfish-ray { transition: opacity .28s ease, stroke-width .28s ease, filter .28s ease; }
  .preference-starfish-hit { transition: opacity .28s ease, stroke-width .28s ease, filter .28s ease, scale .28s ease; transform-box: fill-box; transform-origin: center; }
  @media (prefers-reduced-motion: reduce) {
    .preference-starfish-pulse, .preference-starfish-core, .preference-starfish-scan { animation: none; }
    .preference-starfish-ray, .preference-starfish-hit { transition: none; }
  }
`

export function PreferenceStarfishChart(props: {
  view: PreferenceProfileView
}) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState('')
  const [hoveredId, setHoveredId] = useState('')
  const [zoom, setZoom] = useState(1)
  const rays = props.view.profile?.rays ?? []
  const activeId = hoveredId || selectedId
  const selected = rays.find((ray) => ray.id === activeId) ?? rays[0]
  const categoryGroups = [...new Set(rays.map((ray) => ray.category))]
    .sort((a, b) => a.localeCompare(b))
    .map((category) => ({
      category,
      rays: rays.filter((ray) => ray.category === category),
    }))
  const groupedRays = categoryGroups.flatMap((group) => group.rays)
  const memory = useQuery({
    queryKey: ['private-acu', 'self-memory'],
    queryFn: getPrivateACUMemory,
    enabled: Boolean(selected?.id),
    staleTime: 30_000,
    retry: false,
  })
  const points = groupedRays.map((ray, index) => {
    const angle = (index * Math.PI * 2) / groupedRays.length - Math.PI / 2
    const radius = 45 + (ray.score / 100) * 205
    return {
      ray,
      angle,
      x: 320 + Math.cos(angle) * radius,
      y: 320 + Math.sin(angle) * radius,
      outerX: 320 + Math.cos(angle) * 272,
      outerY: 320 + Math.sin(angle) * 272,
    }
  })
  const categoryLabels = categoryGroups.map((group) => {
    const groupPoints = points.filter(
      (point) => point.ray.category === group.category
    )
    const first = groupPoints.at(0)?.angle ?? -Math.PI / 2
    const last = groupPoints.at(-1)?.angle ?? first
    const angle = first + (last - first) / 2
    return {
      category: group.category,
      x: 320 + Math.cos(angle) * 310,
      y: 320 + Math.sin(angle) * 310,
      lines: [...group.category].reduce<string[]>((lines, character, index) => {
        const line = Math.floor(index / 14)
        lines[line] = (lines[line] ?? '') + character
        return lines
      }, []),
    }
  })
  const focusId = activeId || rays[0]?.id
  const hasFocus = Boolean(activeId)
  return (
    <div className='min-w-0 space-y-4'>
      <div className='grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]'>
        <div className='min-w-0'>
          <div className='flex justify-end gap-1'>
            <Button
              size='icon'
              variant='ghost'
              disabled={zoom <= 0.5}
              title={t('Zoom out')}
              aria-label={t('Zoom out')}
              onClick={() => setZoom(Math.max(0.5, zoom - 0.5))}
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
            className='text-foreground aspect-square w-full overflow-auto dark:text-white'
            data-testid='preference-chart-viewport'
          >
            <style>{STARFISH_CSS}</style>
            <svg
              viewBox={`${320 - 420 / Math.min(zoom, 1)} ${320 - 420 / Math.min(zoom, 1)} ${840 / Math.min(zoom, 1)} ${840 / Math.min(zoom, 1)}`}
              role='group'
              aria-label={t('Preference starfish')}
              style={{
                width: `${Math.max(zoom, 1) * 100}%`,
                height: `${Math.max(zoom, 1) * 100}%`,
                maxWidth: 'none',
              }}
            >
              <defs>
                <filter
                  id='preference-starfish-glow'
                  x='-100%'
                  y='-100%'
                  width='300%'
                  height='300%'
                >
                  <feGaussianBlur stdDeviation='4' result='blur' />
                  <feMerge>
                    <feMergeNode in='blur' />
                    <feMergeNode in='SourceGraphic' />
                  </feMerge>
                </filter>
                <radialGradient id='preference-starfish-core-gradient'>
                  <stop
                    offset='0%'
                    stopColor='currentColor'
                    stopOpacity='.95'
                  />
                  <stop
                    offset='42%'
                    stopColor='currentColor'
                    stopOpacity='.7'
                  />
                  <stop
                    offset='100%'
                    stopColor='currentColor'
                    stopOpacity='0'
                  />
                </radialGradient>
              </defs>
              {[48, 99, 150, 201, 250].map((radius) => (
                <circle
                  key={radius}
                  cx='320'
                  cy='320'
                  r={radius}
                  fill='none'
                  stroke='currentColor'
                  opacity={radius === 250 ? '.16' : '.08'}
                />
              ))}
              {points.length > 2 && (
                <polygon
                  points={points
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                  fill='currentColor'
                  fillOpacity='.025'
                  stroke='currentColor'
                  strokeOpacity='.18'
                />
              )}
              <circle
                cx='320'
                cy='320'
                r='28'
                fill='none'
                stroke='currentColor'
                strokeOpacity='.15'
                className='preference-starfish-pulse'
              />
              <circle
                cx='320'
                cy='320'
                r='12'
                fill='url(#preference-starfish-core-gradient)'
                filter='url(#preference-starfish-glow)'
                className='preference-starfish-core'
              />
              <circle
                cx='320'
                cy='320'
                r='3'
                fill='currentColor'
                filter='url(#preference-starfish-glow)'
              />
              <circle
                cx='320'
                cy='320'
                r='250'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.5'
                strokeDasharray='120 400'
                className='preference-starfish-scan'
              />
              {categoryLabels.map((label) => (
                <text
                  key={label.category}
                  x={label.x}
                  y={label.y}
                  textAnchor='middle'
                  fontSize='14'
                  letterSpacing='0'
                  fill='currentColor'
                  opacity='.72'
                >
                  {label.lines.map((line, index) => (
                    <tspan
                      key={`${line}-${label.lines.slice(0, index).join('')}`}
                      x={label.x}
                      dy={index === 0 ? -((label.lines.length - 1) * 9) : 18}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              ))}
              {points.map((point) => (
                <g
                  key={point.ray.id}
                  role='button'
                  tabIndex={0}
                  aria-label={point.ray.label}
                  aria-pressed={focusId === point.ray.id}
                  onClick={() => setSelectedId(point.ray.id)}
                  onFocus={() => setHoveredId(point.ray.id)}
                  onBlur={() => setHoveredId('')}
                  onMouseEnter={() => setHoveredId(point.ray.id)}
                  onMouseLeave={() => setHoveredId('')}
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
                    strokeOpacity={
                      hasFocus && focusId !== point.ray.id ? '.045' : '.12'
                    }
                  />
                  <line
                    x1='320'
                    y1='320'
                    x2={point.x}
                    y2={point.y}
                    stroke='currentColor'
                    strokeWidth={focusId === point.ray.id ? 4 : 1.5}
                    opacity={
                      hasFocus && focusId !== point.ray.id
                        ? '.16'
                        : 0.42 + (point.ray.confidence / 100) * 0.58
                    }
                    filter={
                      focusId === point.ray.id
                        ? 'url(#preference-starfish-glow)'
                        : undefined
                    }
                    className='preference-starfish-ray'
                  />
                  <line
                    x1='320'
                    y1='320'
                    x2={point.outerX}
                    y2={point.outerY}
                    stroke='transparent'
                    strokeWidth='14'
                  />
                  <path
                    d='M -7 -3 L 0 0 L -7 3'
                    transform={`translate(${point.x} ${point.y}) rotate(${(point.angle * 180) / Math.PI})`}
                    fill='none'
                    stroke='currentColor'
                    strokeWidth={focusId === point.ray.id ? 2.2 : 1.5}
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    style={{ scale: focusId === point.ray.id ? '1.18' : '1' }}
                    opacity={
                      hasFocus && focusId !== point.ray.id ? '.34' : '.92'
                    }
                    filter={
                      focusId === point.ray.id
                        ? 'url(#preference-starfish-glow)'
                        : undefined
                    }
                    className='preference-starfish-hit'
                  />
                </g>
              ))}
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
          <div className='border-t pt-3'>
            <div className='text-muted-foreground mb-2 text-xs'>
              {t('Preference domains')}
            </div>
            <ul className='space-y-1'>
              {categoryGroups.map((group) => (
                <li key={group.category}>
                  <button
                    type='button'
                    className='hover:bg-muted flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-xs'
                    onClick={() => setSelectedId(group.rays[0]?.id ?? '')}
                  >
                    <span className='min-w-0 break-words'>
                      {group.category}
                    </span>
                    <span className='text-muted-foreground shrink-0 tabular-nums'>
                      {group.rays.length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
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

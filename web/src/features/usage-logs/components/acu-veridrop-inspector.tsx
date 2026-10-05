import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  getACUProfileGpttesticuHistory,
  type ACUChannelMonitorProfile,
  type ACUVeridropResult,
} from '../api'
import {
  buildGpttesticuPreview,
  extractGpttesticuHtml,
} from '../lib/gpttesticu-render'

function formatEvidence(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatDuration(value?: number): string {
  if (value == null || value < 0) return 'n/a'
  const seconds = Math.round(value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`
}

export function ACUVeridropInspector(props: {
  open: boolean
  profile: ACUChannelMonitorProfile | null
  protocol: string | null
  loading: boolean
  result: ACUVeridropResult | null
  method?: 'veridrop' | 'gpttesticu'
  onStart?: () => void
  requestError?: string
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [selectedHistory, setSelectedHistory] =
    useState<ACUVeridropResult | null>(null)
  const historyQuery = useQuery({
    queryKey: ['gpttesticu-history', props.profile?.executionProfileId],
    queryFn: () =>
      getACUProfileGpttesticuHistory(props.profile?.executionProfileId ?? ''),
    enabled:
      props.open &&
      props.method === 'gpttesticu' &&
      Boolean(props.profile?.executionProfileId),
    staleTime: 0,
  })
  useEffect(() => {
    setSelectedHistory(null)
  }, [props.profile?.executionProfileId, props.method])
  const activeResult = props.result ?? selectedHistory
  const extractedHtml = activeResult?.sample
    ? extractGpttesticuHtml(activeResult.sample)
    : null
  const previewDocument =
    props.method === 'gpttesticu' && extractedHtml
      ? buildGpttesticuPreview(extractedHtml)
      : null
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side='right' className='sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>
            {props.method === 'gpttesticu'
              ? t('gpttesticu SVG check')
              : t('Veridrop check')}
          </SheetTitle>
          <SheetDescription>
            {props.method === 'gpttesticu'
              ? t('Administrator-only SVG behavior check for this ACU route')
              : t('Standard authenticity check for this ACU route')}
          </SheetDescription>
        </SheetHeader>
        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto px-4 text-xs'>
          <div className='text-muted-foreground grid grid-cols-2 gap-2 border-b pb-3'>
            <span>{t('Protocol')}</span>
            <span>{props.protocol ?? t('n/a')}</span>
            <span>{t('Mode')}</span>
            <span>{activeResult?.mode ?? t('Standard')}</span>
          </div>
          {props.method === 'gpttesticu' && props.onStart ? (
            <div className='flex items-center justify-between gap-2 rounded border p-2'>
              <span className='text-muted-foreground'>
                {t('Run a new SVG behavior test for this Profile')}
              </span>
              <button
                type='button'
                className='bg-primary text-primary-foreground rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50'
                disabled={props.loading}
                onClick={props.onStart}
              >
                {props.loading
                  ? t('Generating SVG preview...')
                  : t('Start test')}
              </button>
            </div>
          ) : null}
          {props.method === 'gpttesticu' && historyQuery.data?.data?.length ? (
            <div className='space-y-2 rounded border p-2'>
              <div className='font-medium'>{t('SVG test history')}</div>
              <div className='max-h-40 space-y-1 overflow-y-auto'>
                {historyQuery.data.data.map((item) => (
                  <button
                    type='button'
                    key={String(item.historyId ?? item.createdAt)}
                    className='hover:bg-muted flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left'
                    onClick={() => setSelectedHistory(item)}
                  >
                    <span className='truncate'>
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : t('Unknown time')}
                    </span>
                    <span className='shrink-0 font-medium'>
                      {item.verdict ?? t('Unknown')} · {item.score ?? t('n/a')}{' '}
                      · {t('Task duration')}: {formatDuration(item.durationMs)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {props.loading ? (
            <div className='text-muted-foreground rounded border p-3'>
              {props.method === 'gpttesticu'
                ? t('Generating SVG preview...')
                : t('Running Veridrop check...')}
            </div>
          ) : null}
          {props.requestError ? (
            <div className='text-destructive rounded border border-red-300 p-3'>
              {props.requestError}
            </div>
          ) : null}
          {activeResult?.supported === false ? (
            <div className='rounded border p-3'>
              {t('This protocol is not supported by the quick check')}
            </div>
          ) : null}
          {activeResult?.supported ? (
            <>
              <div className='grid grid-cols-2 gap-2 border-b pb-3'>
                <span className='text-muted-foreground'>{t('Verdict')}</span>
                <span className='font-medium'>
                  {activeResult.verdict ?? t('Unknown')}
                </span>
                <span className='text-muted-foreground'>{t('Score')}</span>
                <span>{activeResult.score ?? t('n/a')}</span>
                <span className='text-muted-foreground'>
                  {t('Detected model')}
                </span>
                <span className='break-words'>
                  {activeResult.actualModel ?? t('n/a')}
                </span>
                <span className='text-muted-foreground'>
                  {t('Target model')}
                </span>
                <span className='break-words'>
                  {activeResult.targetModel ?? t('n/a')}
                </span>
                <span className='text-muted-foreground'>
                  {t('Evidence summary')}
                </span>
                <span className='break-words'>
                  {activeResult.summary ?? t('n/a')}
                </span>
                <span className='text-muted-foreground'>{t('Completed')}</span>
                <span>
                  {activeResult.completedAt
                    ? new Date(activeResult.completedAt).toLocaleString()
                    : t('n/a')}
                </span>
              </div>
              {activeResult.selfReportedIdentity ? (
                <div className='space-y-1 rounded border p-2'>
                  <div className='font-medium'>{t('Identity response')}</div>
                  <div className='text-muted-foreground break-words whitespace-pre-wrap'>
                    {activeResult.selfReportedIdentity}
                  </div>
                </div>
              ) : null}
              {activeResult.detectedBrands?.length ? (
                <div className='border-destructive/40 rounded border p-2'>
                  <div className='font-medium'>
                    {t('Detected non-native brands')}
                  </div>
                  <div className='text-muted-foreground mt-1 break-words'>
                    {activeResult.detectedBrands.join(', ')}
                  </div>
                </div>
              ) : null}
              {activeResult.performance ? (
                <div className='space-y-2 rounded border p-2'>
                  <div className='font-medium'>{t('Performance evidence')}</div>
                  <pre className='bg-muted/40 max-h-56 overflow-auto rounded p-2 text-[11px] break-words whitespace-pre-wrap'>
                    {formatEvidence(activeResult.performance)}
                  </pre>
                </div>
              ) : null}
              {activeResult.sample ? (
                <div className='space-y-2 rounded border p-2'>
                  {previewDocument ? (
                    <div className='space-y-2'>
                      <div className='font-medium'>{t('SVG preview')}</div>
                      <iframe
                        title={t('SVG preview')}
                        sandbox=''
                        srcDoc={previewDocument}
                        className='h-80 w-full rounded border bg-white'
                      />
                    </div>
                  ) : null}
                  <div className='font-medium'>{t('Sampled output')}</div>
                  <pre className='bg-muted/40 max-h-80 overflow-auto rounded p-2 text-[11px] break-words whitespace-pre-wrap'>
                    {activeResult.sample}
                  </pre>
                </div>
              ) : null}
              {activeResult.detectors?.length ? (
                <div className='space-y-2'>
                  <div className='font-medium'>{t('Detector summary')}</div>
                  {activeResult.detectors.map((detector) => (
                    <details
                      key={String(detector.name ?? 'detector')}
                      className='rounded border p-2'
                    >
                      <summary className='cursor-pointer list-none'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <span className='font-medium'>
                            {String(
                              detector.display_name ??
                                detector.name ??
                                t('Detector')
                            )}
                          </span>
                          <span className='text-muted-foreground'>
                            {String(detector.status ?? t('Unknown'))}
                            {detector.score != null
                              ? ` · ${String(detector.score)}`
                              : ''}
                          </span>
                        </div>
                      </summary>
                      <div className='text-muted-foreground mt-1'>
                        <pre className='bg-muted/40 mt-2 max-h-80 overflow-auto rounded p-2 text-[11px] break-words whitespace-pre-wrap'>
                          {formatEvidence(
                            Object.fromEntries(
                              Object.entries(detector).filter(
                                ([key]) =>
                                  key !== 'name' && key !== 'display_name'
                              )
                            )
                          )}
                        </pre>
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
              <div className='text-muted-foreground rounded border p-3'>
                {t(
                  'This result is informational only and does not affect routing or health status.'
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

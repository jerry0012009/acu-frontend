import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import type { ACUChannelMonitorProfile, ACUVeridropResult } from '../api'

function formatEvidence(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractRenderableDocument(value: string): string | null {
  const fenced = [
    ...value.matchAll(
      /```(?:html|htm|xml|svg)?[^\S\n]*\r?\n([\s\S]*?)(?:```|$)/gi
    ),
  ]
    .map((match) => match[1])
    .filter((candidate) => /<svg\b/i.test(candidate))
  if (fenced.length) return fenced.at(-1)?.trim() ?? null

  const lower = value.toLowerCase()
  const htmlStart = lower.indexOf('<!doctype html')
  const rootStart = lower.indexOf('<html')
  if (htmlStart >= 0 || rootStart >= 0) {
    const start =
      htmlStart >= 0 && (rootStart < 0 || htmlStart < rootStart)
        ? htmlStart
        : rootStart
    return value.slice(start).trim()
  }

  const svgStart = lower.indexOf('<svg')
  if (svgStart >= 0) return value.slice(svgStart).trim()
  return null
}

function buildSafePreview(value: string): string | null {
  const document = extractRenderableDocument(value)
  if (!document || !/<svg\b/i.test(document)) return null
  const sanitized = DOMPurify.sanitize(document, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['src', 'href', 'xlink:href', 'action', 'formaction'],
    ALLOW_DATA_ATTR: false,
  })
  if (!/<svg\b/i.test(sanitized)) return null
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;min-height:100%;background:#fff}body{display:grid;place-items:center;padding:12px}svg{width:100%;height:auto;max-height:100%;display:block}</style></head><body>${sanitized}</body></html>`
}

export function ACUVeridropInspector(props: {
  open: boolean
  profile: ACUChannelMonitorProfile | null
  protocol: string | null
  loading: boolean
  result: ACUVeridropResult | null
  method?: 'veridrop' | 'gpttesticu'
  requestError?: string
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const previewDocument =
    props.method === 'gpttesticu' && props.result?.sample
      ? buildSafePreview(props.result.sample)
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
            <span>{props.result?.mode ?? t('Standard')}</span>
          </div>
          {props.loading ? (
            <div className='text-muted-foreground rounded border p-3'>
              {t('Running Veridrop check...')}
            </div>
          ) : null}
          {props.requestError ? (
            <div className='text-destructive rounded border border-red-300 p-3'>
              {props.requestError}
            </div>
          ) : null}
          {props.result?.supported === false ? (
            <div className='rounded border p-3'>
              {t('This protocol is not supported by the quick check')}
            </div>
          ) : null}
          {props.result?.supported ? (
            <>
              <div className='grid grid-cols-2 gap-2 border-b pb-3'>
                <span className='text-muted-foreground'>{t('Verdict')}</span>
                <span className='font-medium'>
                  {props.result.verdict ?? t('Unknown')}
                </span>
                <span className='text-muted-foreground'>{t('Score')}</span>
                <span>{props.result.score ?? t('n/a')}</span>
                <span className='text-muted-foreground'>
                  {t('Detected model')}
                </span>
                <span className='break-words'>
                  {props.result.actualModel ?? t('n/a')}
                </span>
                <span className='text-muted-foreground'>
                  {t('Target model')}
                </span>
                <span className='break-words'>
                  {props.result.targetModel ?? t('n/a')}
                </span>
                <span className='text-muted-foreground'>
                  {t('Evidence summary')}
                </span>
                <span className='break-words'>
                  {props.result.summary ?? t('n/a')}
                </span>
                <span className='text-muted-foreground'>{t('Completed')}</span>
                <span>
                  {props.result.completedAt
                    ? new Date(props.result.completedAt).toLocaleString()
                    : t('n/a')}
                </span>
              </div>
              {props.result.selfReportedIdentity ? (
                <div className='space-y-1 rounded border p-2'>
                  <div className='font-medium'>{t('Identity response')}</div>
                  <div className='text-muted-foreground break-words whitespace-pre-wrap'>
                    {props.result.selfReportedIdentity}
                  </div>
                </div>
              ) : null}
              {props.result.detectedBrands?.length ? (
                <div className='border-destructive/40 rounded border p-2'>
                  <div className='font-medium'>
                    {t('Detected non-native brands')}
                  </div>
                  <div className='text-muted-foreground mt-1 break-words'>
                    {props.result.detectedBrands.join(', ')}
                  </div>
                </div>
              ) : null}
              {props.result.performance ? (
                <div className='space-y-2 rounded border p-2'>
                  <div className='font-medium'>{t('Performance evidence')}</div>
                  <pre className='bg-muted/40 max-h-56 overflow-auto rounded p-2 text-[11px] break-words whitespace-pre-wrap'>
                    {formatEvidence(props.result.performance)}
                  </pre>
                </div>
              ) : null}
              {props.result.sample ? (
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
                    {props.result.sample}
                  </pre>
                </div>
              ) : null}
              {props.result.detectors?.length ? (
                <div className='space-y-2'>
                  <div className='font-medium'>{t('Detector summary')}</div>
                  {props.result.detectors.map((detector) => (
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

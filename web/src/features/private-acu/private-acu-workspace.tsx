import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  FileCode2,
  Film,
  Gauge,
  Image,
  ListChecks,
  MessageSquareText,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PrivateACUAdmin } from '@/features/dashboard/components/admin/private-acu-admin'
import { PrivateACUFilmPOC } from '@/features/dashboard/components/admin/private-acu-film-poc'
import { PrivateACULearningRuns } from '@/features/dashboard/components/admin/private-acu-learning-runs'
import { PrivateACUSkillCatalog } from '@/features/dashboard/components/admin/private-acu-skill-catalog'
import {
  getPrivateACUFilmStatus,
  getPrivateACULearningRunDetail,
  getPrivateACULearningRuns,
  getPrivateACUMemory,
  getPrivateACUPrompts,
  type PrivateACULearningRunDetail,
  type PrivateACUPromptExample,
  type PrivateACUPromptCard,
} from '@/features/dashboard/private-acu-admin-api'
import { getPrivateACUFilmForUser } from '@/features/dashboard/private-acu-user-api'
import { PromptExamples } from '@/features/private-acu/prompt-examples'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export type PrivateACUSection =
  | 'overview'
  | 'account'
  | 'film'
  | 'learning-runs'
  | 'prompts'

type LearningFlowStep = {
  label: string
  title: string
  description: string
  icon: LucideIcon
  prompt: LearningFlowPromptState
}

type LearningFlowPromptItem = Pick<
  PrivateACUPromptCard,
  | 'id'
  | 'title'
  | 'description'
  | 'content'
  | 'language'
  | 'source'
  | 'execution'
  | 'examples'
>

type LearningFlowPromptState = {
  status:
    | 'available'
    | 'loading'
    | 'unavailable'
    | 'not-applicable'
    | 'restricted'
  items?: LearningFlowPromptItem[]
  examples?: PrivateACUPromptExample[]
  examplesOptions?: {
    materialLabel?: string
    artifactLabel?: string
    materialHint?: string
    artifactHint?: string
    hideArtifact?: boolean
  }
  runDetail?: PrivateACULearningRunDetail
  runLoading?: boolean
  runView?: 'summary' | 'skill-changes'
}

type DistilledClaimPreview = {
  topic: string
  appliesWhen: string
  prefer: string
}

function parseDistilledClaimPreviews(value: unknown): DistilledClaimPreview[] {
  if (typeof value !== 'string') return []
  return value
    .split(/### Claim \d+/u)
    .slice(1)
    .map((claim) => ({
      topic: claim.match(/\*\*Topic:\*\*\s*(.+)/u)?.[1]?.trim() ?? '',
      appliesWhen:
        claim.match(/\*\*Applies When:\*\*\s*(.+)/u)?.[1]?.trim() ?? '',
      prefer: claim.match(/\*\*Prefer:\*\*\s*(.+)/u)?.[1]?.trim() ?? '',
    }))
    .filter((claim) => claim.topic || claim.appliesWhen || claim.prefer)
}

type AgentContextMessage = {
  role?: string
  content?: unknown
}

function parseAgentContext(value: unknown): {
  input?: AgentContextMessage[]
} | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const input =
      (parsed as { input?: unknown; messages?: unknown }).input ??
      (parsed as { messages?: unknown }).messages
    if (!Array.isArray(input)) return null
    return {
      input: input.filter(
        (item): item is AgentContextMessage =>
          Boolean(item) && typeof item === 'object'
      ),
    }
  } catch {
    return null
  }
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const text = (part as { text?: unknown }).text
      return typeof text === 'string' ? text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function accountRunExamples(
  detail: PrivateACULearningRunDetail | undefined,
  step: 'input' | 'experience'
): PrivateACUPromptExample[] | undefined {
  if (!detail) return undefined
  const context = parseAgentContext(detail.evidence.agentContext)
  const messages = context?.input ?? []
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user')
  const latestText = messageText(latestUserMessage?.content)
  if (!latestText) return undefined

  const firstUserMessage = messages.find((message) => message.role === 'user')
  const firstText = messageText(firstUserMessage?.content)
  const artifact =
    step === 'input'
      ? {
          experience_id: detail.experienceId,
          learning_trigger: detail.learningKind,
          latest_user_message: latestText,
          context_message_count: messages.length,
        }
      : {
          experience_id: detail.experienceId,
          source: '完整 Agent Context',
          latest_user_message: latestText,
          preceding_user_context: firstText || undefined,
          learning_trigger: detail.learningKind,
        }

  return [
    {
      id: `${detail.runId}-${step}`,
      title: step === 'input' ? '真实账户学习输入' : '真实账户学习 Experience',
      origin: 'captured_run',
      material: {
        text:
          step === 'input'
            ? `最新人工消息：\n${latestText}`
            : `完整上下文中的最新人工消息：\n${latestText}`,
      },
      artifact: {
        format: 'json',
        content: artifact,
      },
      sourceRunId: detail.runId,
    },
  ]
}

function diffAddedLines(diff: string): string[] {
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1).trim())
    .filter(Boolean)
}

function promptItems(cards?: PrivateACUPromptCard[]): LearningFlowPromptItem[] {
  return (cards ?? []).map((card) => ({
    id: card.id,
    title: card.title,
    description: card.description,
    content: card.content,
    language: card.language,
    source: card.source,
    execution: card.execution,
    examples: card.examples,
  }))
}

function promptLanguage(content: string): 'zh-CN' | 'mixed' | 'en' {
  const hasChinese = /[\u3400-\u9fff]/u.test(content)
  const hasLatin = /[A-Za-z]{3,}/u.test(content)
  if (hasChinese && hasLatin) return 'mixed'
  if (hasChinese) return 'zh-CN'
  return 'en'
}

function promptStateForCards(
  isAdmin: boolean,
  isLoading: boolean,
  isError: boolean,
  cards?: PrivateACUPromptCard[]
): LearningFlowPromptState {
  if (!isAdmin) return { status: 'restricted' }
  if (isLoading) return { status: 'loading' }
  const effectiveCards = cards?.filter(
    (card) => card.execution === 'used' && card.stage !== 'task'
  )
  if (effectiveCards?.length) {
    return {
      status: 'available',
      items: promptItems(effectiveCards),
    }
  }
  if (isError) return { status: 'unavailable' }
  return { status: 'not-applicable' }
}

function filmStepExamples(
  cards: PrivateACUPromptCard[] | undefined,
  step: 'input' | 'experience'
): PrivateACUPromptExample[] | undefined {
  const source = cards?.flatMap((card) => card.examples ?? [])[0]
  if (!source) return undefined

  if (step === 'input') {
    return [
      {
        ...source,
        id: `${source.id}-input`,
        title: '团队提交的图文样本',
        material: {
          text: source.material.text,
          images: source.material.images,
        },
      },
    ]
  }

  return [
    {
      ...source,
      id: `${source.id}-experience`,
      title: 'SelectionExperience：素材、语境与团队判断',
      artifact: {
        format: 'json',
        content: source.material.json ?? source.artifact.content,
      },
    },
  ]
}

function LearningRunSummary(props: {
  detail?: PrivateACULearningRunDetail
  loading?: boolean
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return (
      <p className='text-muted-foreground text-xs'>
        {t('Loading captured run')}
      </p>
    )
  }
  if (!props.detail) {
    return (
      <p className='text-muted-foreground text-xs'>{t('No captured run')}</p>
    )
  }
  const detail = props.detail
  const claimPreviews = parseDistilledClaimPreviews(
    detail.distillation.distilled_context
  ).slice(0, 3)
  return (
    <section className='border-border space-y-3 border-t pt-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h5 className='text-sm font-semibold'>{t('Captured learning run')}</h5>
        <Badge variant='secondary'>{detail.status}</Badge>
      </div>
      <div className='grid gap-2 sm:grid-cols-3'>
        <div className='bg-muted/30 rounded-md p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Experience')}
          </div>
          <div className='mt-1 text-xs font-medium break-all'>
            {detail.experienceId || '-'}
          </div>
        </div>
        <div className='bg-muted/30 rounded-md p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Learning claims')}
          </div>
          <div className='mt-1 text-lg font-semibold'>
            {detail.elementCount}
          </div>
        </div>
        <div className='bg-muted/30 rounded-md p-3'>
          <div className='text-muted-foreground text-[11px]'>
            {t('Skill updates')}
          </div>
          <div className='mt-1 text-lg font-semibold'>
            {detail.skillChangeCount}
          </div>
        </div>
      </div>
      <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
        <span className='text-muted-foreground break-all'>
          {t('Run')} · {detail.runId}
        </span>
        <Button
          variant='outline'
          size='sm'
          render={
            <Link
              to='/private-acu/$section'
              params={{ section: 'learning-runs' }}
            />
          }
        >
          {t('Open learning runs')}
          <ArrowRight />
        </Button>
      </div>
      {claimPreviews.length ? (
        <div className='space-y-2'>
          <h6 className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
            {t('Distillation highlights')}
          </h6>
          <div className='space-y-2'>
            {claimPreviews.map((claim) => (
              <article
                key={`${claim.topic}-${claim.appliesWhen}-${claim.prefer}`}
                className='rounded-md border-l-2 border-amber-500/40 bg-amber-500/5 p-3'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant='outline' className='text-[10px]'>
                    {claim.topic}
                  </Badge>
                  <span className='text-muted-foreground text-[11px]'>
                    {t('Learning Claim')}
                  </span>
                </div>
                {claim.appliesWhen ? (
                  <p className='mt-2 text-xs leading-5'>
                    <strong>{t('Expression goal')}：</strong>
                    {claim.appliesWhen}
                  </p>
                ) : null}
                {claim.prefer ? (
                  <p className='mt-1 text-xs leading-5'>
                    <strong>{t('Visual implementation')}：</strong>
                    {claim.prefer}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <details className='border-border rounded-md border p-3'>
        <summary className='cursor-pointer text-xs font-semibold'>
          {t('Distillation output')}
        </summary>
        <pre className='bg-muted/30 mt-3 max-h-72 overflow-auto rounded-md p-3 text-xs leading-5 whitespace-pre-wrap'>
          {typeof detail.distillation.distilled_context === 'string'
            ? detail.distillation.distilled_context
            : JSON.stringify(detail.distillation, null, 2)}
        </pre>
      </details>
    </section>
  )
}

function SkillChangeExamples(props: {
  detail?: PrivateACULearningRunDetail
  loading?: boolean
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return (
      <p className='text-muted-foreground text-xs'>
        {t('Loading captured run')}
      </p>
    )
  }
  if (!props.detail?.skillChanges.length) {
    return (
      <p className='text-muted-foreground text-xs'>
        {t('No real Skill changes')}
      </p>
    )
  }
  const changes = props.detail.skillChanges.slice(0, 3)
  return (
    <section className='border-border space-y-3 border-t pt-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h5 className='text-sm font-semibold'>{t('Real Skill changes')}</h5>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('This Experience produced the following Skill updates.')}
          </p>
        </div>
        <Badge variant='secondary'>
          {props.detail.skillChangeCount} {t('Skills')}
        </Badge>
      </div>
      <div className='space-y-2'>
        {changes.map((change) => {
          const firstFile = change.files[0]
          const descriptionUnchanged =
            change.descriptionBefore === change.descriptionAfter
          const addedLines = firstFile ? diffAddedLines(firstFile.diff) : []
          const beforeBody = firstFile?.before || ''
          const afterBody = firstFile?.after || ''
          return (
            <details
              key={`${change.skillId}-${change.changeType}`}
              className='border-border rounded-md border p-3'
              open
            >
              <summary className='flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-medium'>
                <span className='min-w-0 break-all'>{change.name}</span>
                <Badge variant='outline' className='shrink-0 text-[10px]'>
                  {change.changeType}
                </Badge>
              </summary>
              <div className='mt-3 space-y-3'>
                <div className='rounded-md border-l-2 border-amber-500/40 bg-amber-500/5 p-3'>
                  <h6 className='text-sm font-semibold'>
                    {t('Change spotlight')}
                  </h6>
                  <p className='text-muted-foreground mt-1 text-xs leading-5'>
                    {descriptionUnchanged
                      ? t(
                          'Skill description unchanged; the learning result is in the document body.'
                        )
                      : t(
                          'Skill description and document body were both updated.'
                        )}
                  </p>
                  {addedLines.length ? (
                    <div className='mt-2 space-y-1'>
                      <div className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                        {t('New learning rules')}
                      </div>
                      {addedLines.slice(0, 4).map((line) => (
                        <p
                          key={line}
                          className='text-foreground rounded bg-emerald-500/10 px-2 py-1 text-xs leading-5 font-medium'
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className='grid gap-3 lg:grid-cols-2'>
                  <details className='min-w-0'>
                    <summary className='text-muted-foreground cursor-pointer text-[11px] font-semibold tracking-wide uppercase'>
                      {t('Before')}
                      {descriptionUnchanged
                        ? ` · ${t('Description unchanged')}`
                        : ''}
                    </summary>
                    <pre className='bg-muted/30 mt-1 max-h-48 overflow-auto rounded-md p-2 text-xs leading-5 whitespace-pre-wrap'>
                      {beforeBody || change.descriptionBefore || '-'}
                    </pre>
                  </details>
                  <details className='min-w-0' open>
                    <summary className='text-muted-foreground cursor-pointer text-[11px] font-semibold tracking-wide uppercase'>
                      {t('After')}
                    </summary>
                    <pre className='mt-1 max-h-48 overflow-auto rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs leading-5 whitespace-pre-wrap'>
                      {afterBody || change.descriptionAfter || '-'}
                    </pre>
                  </details>
                </div>
                {firstFile ? (
                  <div>
                    <div className='text-muted-foreground mb-1 font-mono text-[11px]'>
                      {firstFile.path}
                    </div>
                    <div className='bg-muted/30 max-h-64 overflow-auto rounded-md p-2 text-xs leading-5'>
                      {firstFile.diff ? (
                        firstFile.diff.split('\n').map((line) => {
                          const added =
                            line.startsWith('+') && !line.startsWith('+++')
                          const removed =
                            line.startsWith('-') && !line.startsWith('---')
                          let lineClass = 'text-muted-foreground'
                          if (added) {
                            lineClass =
                              'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                          } else if (removed) {
                            lineClass =
                              'bg-red-500/10 text-red-800 dark:text-red-200'
                          }
                          return (
                            <div
                              key={line || 'blank'}
                              className={`break-words whitespace-pre-wrap ${lineClass}`}
                            >
                              {line || ' '}
                            </div>
                          )
                        })
                      ) : (
                        <span className='text-muted-foreground'>
                          {t('No diff available')}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

function StepPrompt(props: {
  stepTitle: string
  prompt: LearningFlowPromptState
}) {
  const { t } = useTranslation()
  const statusText: Record<LearningFlowPromptState['status'], string> = {
    available: t('Prompt available'),
    loading: t('Loading prompt'),
    unavailable: t('Prompt unavailable'),
    'not-applicable': t('No independent LLM prompt'),
    restricted: t('Prompt details are available to administrators'),
  }
  const executionText = (execution: LearningFlowPromptItem['execution']) =>
    execution === 'used'
      ? t('Executed')
      : t('Configured but bypassed for explicit learning')
  const showStatus = props.prompt.status !== 'not-applicable'

  return (
    <Dialog
      title={`${props.stepTitle} · ${t('Step details')}`}
      description={t(
        'Inspect the input, evidence, Experience, prompt, or output associated with this learning step.'
      )}
      trigger={
        <Button
          variant='ghost'
          size='icon-xs'
          aria-label={t('View step details')}
          title={t('View step details')}
          data-testid='step-prompt-details'
        >
          <FileCode2 aria-hidden='true' />
        </Button>
      }
      contentClassName='sm:max-w-2xl'
      bodyClassName='space-y-4'
    >
      {showStatus ? (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Prompt status')}
          </span>
          <Badge variant='outline'>{statusText[props.prompt.status]}</Badge>
        </div>
      ) : null}
      {props.prompt.items?.length ? (
        <div className='space-y-3'>
          {props.prompt.items.map((item) => (
            <article
              key={item.id}
              className='border-border space-y-3 rounded-md border p-3'
            >
              <div className='flex items-start justify-between gap-3'>
                <h4 className='min-w-0 text-sm font-semibold'>{item.title}</h4>
                <Badge variant='secondary' className='shrink-0 text-[10px]'>
                  {item.language}
                </Badge>
              </div>
              <p className='text-muted-foreground text-xs leading-5'>
                {item.description}
              </p>
              <dl className='grid gap-2 text-xs sm:grid-cols-2'>
                <div>
                  <dt className='text-muted-foreground'>{t('Source')}</dt>
                  <dd className='mt-1 break-all'>{item.source}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('Execution status')}
                  </dt>
                  <dd className='mt-1'>{executionText(item.execution)}</dd>
                </div>
              </dl>
              <pre className='bg-muted/30 max-h-80 overflow-auto rounded-md p-3 text-xs leading-5 whitespace-pre-wrap'>
                {item.content}
              </pre>
              <PromptExamples examples={item.examples} />
            </article>
          ))}
        </div>
      ) : (
        <div className='space-y-4'>
          {showStatus ? (
            <p className='text-muted-foreground text-sm'>
              {statusText[props.prompt.status]}
            </p>
          ) : null}
          <PromptExamples
            examples={props.prompt.examples}
            {...props.prompt.examplesOptions}
          />
        </div>
      )}
      {props.prompt.items?.length ? (
        <PromptExamples
          examples={props.prompt.examples}
          {...props.prompt.examplesOptions}
        />
      ) : null}
      {props.prompt.runView === 'summary' ? (
        <LearningRunSummary
          detail={props.prompt.runDetail}
          loading={props.prompt.runLoading}
        />
      ) : null}
      {props.prompt.runView === 'skill-changes' ? (
        <SkillChangeExamples
          detail={props.prompt.runDetail}
          loading={props.prompt.runLoading}
        />
      ) : null}
    </Dialog>
  )
}

function WorkspaceCard(props: {
  title: string
  description: string
  icon: typeof BookOpen
  to: string
  value?: string
}) {
  return (
    <div className='border-border bg-card flex min-w-0 flex-col justify-between gap-4 rounded-lg border p-4 shadow-xs'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 className='font-semibold'>{props.title}</h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            {props.description}
          </p>
        </div>
        <props.icon className='text-muted-foreground size-5 shrink-0' />
      </div>
      <div className='flex items-center justify-between gap-3'>
        {props.value ? (
          <Badge variant='secondary'>{props.value}</Badge>
        ) : (
          <span />
        )}
        <Button variant='ghost' size='sm' render={<Link to={props.to} />}>
          {useTranslation().t('Open')}
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function LearningFlowLane(props: {
  title: string
  description: string
  icon: LucideIcon
  tone: 'account' | 'film'
  steps: LearningFlowStep[]
}) {
  const toneClass =
    props.tone === 'account'
      ? {
          icon: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
          line: 'text-cyan-500',
          marker: 'bg-cyan-500 text-white',
        }
      : {
          icon: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
          line: 'text-amber-500',
          marker: 'bg-amber-500 text-white',
        }

  return (
    <section className='border-border overflow-hidden rounded-lg border'>
      <header className='bg-muted/20 border-border border-b p-4'>
        <div className='flex items-start gap-3'>
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-md ${toneClass.icon}`}
          >
            <props.icon className='size-4' aria-hidden='true' />
          </div>
          <div className='min-w-0'>
            <h4 className='font-semibold'>{props.title}</h4>
            <p className='text-muted-foreground mt-1 text-sm'>
              {props.description}
            </p>
          </div>
        </div>
      </header>
      <ol className='divide-border divide-y'>
        {props.steps.map((step, index) => (
          <li key={step.label} className='relative flex gap-3 p-4'>
            <div
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${toneClass.marker}`}
            >
              {index + 1}
            </div>
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2'>
                <step.icon
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
                <span className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                  {step.label}
                </span>
              </div>
              <div className='mt-1 flex items-center gap-1'>
                <h5 className='min-w-0 flex-1 text-sm font-semibold'>
                  {step.title}
                </h5>
                <StepPrompt stepTitle={step.title} prompt={step.prompt} />
              </div>
              <p className='text-muted-foreground mt-1 text-sm leading-5'>
                {step.description}
              </p>
            </div>
            {index < props.steps.length - 1 && (
              <ArrowDown
                className={`bg-background absolute bottom-0 left-[1.1rem] size-3 translate-y-1/2 ${toneClass.line}`}
                aria-hidden='true'
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function SharedLearningBackbone() {
  const { t } = useTranslation()
  const stages = [
    [t('Input'), '01'],
    [t('Evidence'), '02'],
    [t('Experience'), '03'],
    [t('Learning'), '04'],
    [t('Quality Skill'), '05'],
  ]

  return (
    <div className='space-y-2 overflow-x-auto'>
      <div className='grid min-w-[760px] grid-cols-5 gap-2'>
        {stages.map(([label, number], index) => (
          <div key={label} className='flex items-center gap-2'>
            <div className='bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold'>
              {number}
            </div>
            <span className='text-sm font-medium'>{label}</span>
            {index < stages.length - 1 && (
              <ArrowRight
                className='text-muted-foreground ml-auto size-4'
                aria-hidden='true'
              />
            )}
          </div>
        ))}
      </div>
      <p className='text-muted-foreground min-w-[760px] text-xs'>
        {t('Film POC records evidence inside SelectionExperience.')}
      </p>
    </div>
  )
}

function OverviewPage(props: { isAdmin: boolean }) {
  const { t } = useTranslation()
  const adminFilmQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'film'],
    queryFn: getPrivateACUFilmStatus,
    enabled: props.isAdmin,
  })
  const memberFilmQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'member-film'],
    queryFn: getPrivateACUFilmForUser,
    enabled: !props.isAdmin,
    retry: false,
  })
  const accountPromptsQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'account-prompts'],
    queryFn: getPrivateACUPrompts,
    enabled: props.isAdmin,
  })
  const accountMemoryQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'account-memory'],
    queryFn: () => getPrivateACUMemory(),
    enabled: props.isAdmin,
    retry: false,
  })
  const filmRunsQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'film-learning-runs'],
    queryFn: () => getPrivateACULearningRuns(10, 'film_preference_v1'),
    enabled: props.isAdmin,
    retry: false,
  })
  const accountRunsQuery = useQuery({
    queryKey: ['private-acu', 'overview', 'account-learning-runs'],
    queryFn: () => getPrivateACULearningRuns(10, 'user_dissatisfaction'),
    enabled: props.isAdmin,
    retry: false,
  })
  const latestCompletedAccountRun = accountRunsQuery.data?.find(
    (run) => run.status.toLowerCase() === 'completed'
  )
  const accountRunDetailQuery = useQuery({
    queryKey: [
      'private-acu',
      'overview',
      'account-learning-run',
      latestCompletedAccountRun?.runId,
    ],
    queryFn: () =>
      getPrivateACULearningRunDetail(latestCompletedAccountRun?.runId || ''),
    enabled: props.isAdmin && Boolean(latestCompletedAccountRun?.runId),
    retry: false,
  })
  const latestCompletedFilmRun = filmRunsQuery.data?.find(
    (run) => run.status.toLowerCase() === 'completed'
  )
  const filmRunDetailQuery = useQuery({
    queryKey: [
      'private-acu',
      'overview',
      'film-learning-run',
      latestCompletedFilmRun?.runId,
    ],
    queryFn: () =>
      getPrivateACULearningRunDetail(latestCompletedFilmRun?.runId || ''),
    enabled: props.isAdmin && Boolean(latestCompletedFilmRun?.runId),
    retry: false,
  })
  const filmSkills = props.isAdmin
    ? (adminFilmQuery.data?.skills ?? [])
    : (memberFilmQuery.data?.spaces.flatMap((space) => space.skills) ?? [])
  const filmIsError = props.isAdmin
    ? adminFilmQuery.isError
    : memberFilmQuery.isError
  let accountJudgePrompt: LearningFlowPromptState
  if (!props.isAdmin) {
    accountJudgePrompt = { status: 'restricted' }
  } else if (accountPromptsQuery.isLoading) {
    accountJudgePrompt = { status: 'loading' }
  } else if (accountPromptsQuery.data) {
    accountJudgePrompt = {
      status: 'available',
      items: [
        {
          id: 'private-acu-learning-judge',
          title: t('Private ACU Learning Judge prompt'),
          description: t(
            'Classifies whether the latest human message indicates dissatisfaction with the previous result.'
          ),
          content: accountPromptsQuery.data.learningPrompt,
          language: promptLanguage(accountPromptsQuery.data.learningPrompt),
          source: t('Private ACU prompt configuration'),
          execution: 'used',
          examples: accountPromptsQuery.data.learningExamples,
        },
      ],
    }
  } else {
    accountJudgePrompt = { status: 'unavailable' }
  }
  const accountLearningPrompt = promptStateForCards(
    props.isAdmin,
    accountMemoryQuery.isLoading,
    accountMemoryQuery.isError,
    accountMemoryQuery.data?.promptCards
  )
  const accountInputExamples = accountRunExamples(
    accountRunDetailQuery.data,
    'input'
  )
  const accountExperienceExamples = accountRunExamples(
    accountRunDetailQuery.data,
    'experience'
  )
  const filmLearningPrompt = promptStateForCards(
    props.isAdmin,
    adminFilmQuery.isLoading,
    adminFilmQuery.isError,
    adminFilmQuery.data?.promptCards
  )
  const filmInputExamples = filmStepExamples(
    adminFilmQuery.data?.promptCards,
    'input'
  )
  const filmExperienceExamples = filmStepExamples(
    adminFilmQuery.data?.promptCards,
    'experience'
  )
  const accountFlow: LearningFlowStep[] = [
    {
      label: t('Input'),
      title: t('LLM request context'),
      description: t(
        'A new Agent request and the latest human User Message enter Private ACU.'
      ),
      icon: MessageSquareText,
      prompt: {
        status: 'not-applicable',
        examples: accountInputExamples,
        examplesOptions: {
          materialLabel: t('Actual request input'),
          materialHint: t(
            'This is the latest captured human message that entered the account learning flow.'
          ),
          artifactLabel: t('Input boundary'),
          artifactHint: t(
            'The artifact identifies the learning trigger and the captured context boundary.'
          ),
        },
      },
    },
    {
      label: t('Evidence'),
      title: t('User dissatisfaction'),
      description: t(
        'Learning Judge identifies whether the user is dissatisfied with the prior result.'
      ),
      icon: BrainCircuit,
      prompt: accountJudgePrompt,
    },
    {
      label: t('Experience'),
      title: t('Account learning experience'),
      description: t(
        'The relevant Agent Context is recorded as an account-scoped learning experience.'
      ),
      icon: Workflow,
      prompt: {
        status: 'not-applicable',
        examples: accountExperienceExamples,
        examplesOptions: {
          materialLabel: t('Captured Agent Context'),
          materialHint: t(
            'The learning unit keeps the latest user correction together with its surrounding context.'
          ),
          artifactLabel: t('Account learning Experience'),
          artifactHint: t(
            'This records the Experience ID, trigger, and message boundary sent to Acontext.'
          ),
        },
      },
    },
    {
      label: t('Learning'),
      title: t('Acontext distillation'),
      description: t(
        'Acontext asynchronously extracts or updates reusable preference knowledge.'
      ),
      icon: Sparkles,
      prompt: {
        ...accountLearningPrompt,
        runDetail: accountRunDetailQuery.data,
        runLoading:
          accountRunsQuery.isLoading ||
          (Boolean(latestCompletedAccountRun) &&
            accountRunDetailQuery.isLoading),
        runView: 'summary',
      },
    },
    {
      label: t('Quality Skill'),
      title: t('Reusable account preference'),
      description: t(
        'The resulting Skill becomes part of the account memory for later work.'
      ),
      icon: BookOpen,
      prompt: {
        status: 'not-applicable',
        runDetail: accountRunDetailQuery.data,
        runLoading:
          accountRunsQuery.isLoading ||
          (Boolean(latestCompletedAccountRun) &&
            accountRunDetailQuery.isLoading),
        runView: 'skill-changes',
      },
    },
  ]
  const filmFlow: LearningFlowStep[] = [
    {
      label: t('Input'),
      title: t('Curated image and text'),
      description: t(
        'The team submits one visual sample with its scene context and analysis.'
      ),
      icon: Image,
      prompt: {
        status: 'not-applicable',
        examples: filmInputExamples,
        examplesOptions: {
          materialLabel: t('Team submission'),
          materialHint: t(
            'The image is visual evidence; the text supplies the scene context and expression goal.'
          ),
          hideArtifact: true,
        },
      },
    },
    {
      label: t('Experience'),
      title: t('SelectionExperience with team judgment'),
      description: t(
        'One learning unit binds the image, scene context, visual-language analysis, and the team decision.'
      ),
      icon: Workflow,
      prompt: {
        status: 'not-applicable',
        examples: filmExperienceExamples,
        examplesOptions: {
          materialLabel: t('Material and scene context'),
          materialHint: t(
            'The selected source: one image bound to the scene context and expression goal.'
          ),
          artifactLabel: t('Team judgment and learning unit'),
          artifactHint: t(
            'This includes the structured analysis, effective points, missing points, and team decision.'
          ),
        },
      },
    },
    {
      label: t('Learning'),
      title: t('Film learning adapter'),
      description: t(
        'The adapter sends the experience to the shared Acontext learning service.'
      ),
      icon: Sparkles,
      prompt: {
        ...filmLearningPrompt,
        runDetail: filmRunDetailQuery.data,
        runLoading:
          filmRunsQuery.isLoading ||
          (Boolean(latestCompletedFilmRun) && filmRunDetailQuery.isLoading),
        runView: 'summary',
      },
    },
    {
      label: t('Quality Skill'),
      title: t('GYZ visual-language Skill'),
      description: t(
        'Acontext produces a conditional Quality Skill for future image-generation work.'
      ),
      icon: Film,
      prompt: {
        status: 'not-applicable',
        runDetail: filmRunDetailQuery.data,
        runLoading:
          filmRunsQuery.isLoading ||
          (Boolean(latestCompletedFilmRun) && filmRunDetailQuery.isLoading),
        runView: 'skill-changes',
      },
    },
  ]

  return (
    <div className='space-y-8'>
      <header className='border-border flex flex-wrap items-start justify-between gap-4 border-b pb-5'>
        <div className='max-w-3xl'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase'>
            <Workflow className='size-4' aria-hidden='true' />
            {t('Private ACU')}
          </div>
          <h3 className='mt-2 text-xl font-semibold tracking-tight'>
            {t('Learning system')}
          </h3>
          <p className='text-muted-foreground mt-2 text-sm leading-6'>
            {t(
              'Private ACU turns interaction feedback and curated visual evidence into reusable Quality Skills through one shared learning backbone.'
            )}
          </p>
        </div>
        <Badge variant='secondary' className='shrink-0'>
          {t('Two learning paths')}
        </Badge>
      </header>

      <section
        className='space-y-4'
        aria-labelledby='private-acu-learning-flow'
      >
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div>
            <h3
              id='private-acu-learning-flow'
              className='text-base font-semibold'
            >
              {t('Unified learning flow')}
            </h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Both paths share the same learning backbone; Film POC records team judgment inside SelectionExperience.'
              )}
            </p>
          </div>
          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <span className='size-2 rounded-full bg-cyan-500' />
            {t('Account')}
            <span className='ml-2 size-2 rounded-full bg-amber-500' />
            {t('Film POC')}
          </div>
        </div>
        <div className='border-border bg-muted/10 rounded-lg border p-4'>
          <SharedLearningBackbone />
        </div>
        <div className='grid gap-4 lg:grid-cols-2'>
          <LearningFlowLane
            title={t('LLM call learning')}
            description={t(
              'Improve account-level preferences from real Agent interactions.'
            )}
            icon={BrainCircuit}
            tone='account'
            steps={accountFlow}
          />
          <LearningFlowLane
            title={t('Film POC learning')}
            description={t(
              'Build the GYZ visual-language standard from team-selected material.'
            )}
            icon={Film}
            tone='film'
            steps={filmFlow}
          />
        </div>
      </section>

      <section className='space-y-4'>
        <div>
          <h3 className='text-base font-semibold'>
            {t('Private ACU workspace')}
          </h3>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t(
              'Inspect inputs, learning runs, Skills, and prompt configuration.'
            )}
          </p>
        </div>
        <div className='grid gap-3 md:grid-cols-2'>
          <WorkspaceCard
            title={t('Account learning')}
            description={t(
              'Review account-level memory, experiences, and learning history.'
            )}
            icon={BookOpen}
            to='/private-acu/account'
          />
          <WorkspaceCard
            title={t('Film POC')}
            description={t(
              'Review the team visual-language learning space and Quality Skills.'
            )}
            icon={Film}
            to='/private-acu/film'
            value={
              filmIsError
                ? t('No access')
                : `${filmSkills.length} ${t('skills')}`
            }
          />
          <WorkspaceCard
            title={t('Learning runs')}
            description={t(
              'Inspect the recorded inputs, intermediate results, and Skill changes.'
            )}
            icon={ListChecks}
            to='/private-acu/learning-runs'
          />
          {props.isAdmin && (
            <WorkspaceCard
              title={t('Prompts')}
              description={t(
                'Manage the shared Private ACU prompts and inspect prompt status.'
              )}
              icon={Gauge}
              to='/private-acu/prompts'
            />
          )}
        </div>
      </section>
    </div>
  )
}

function MemberFilmPage() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['private-acu', 'film', 'member'],
    queryFn: getPrivateACUFilmForUser,
  })
  if (query.isLoading) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (query.isError || !query.data) {
    return (
      <div className='border-border bg-muted/20 rounded-lg border p-5'>
        <h3 className='font-semibold'>{t('Film POC access unavailable')}</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('Ask an administrator to bind your account to a POC space.')}
        </p>
      </div>
    )
  }
  return (
    <div className='space-y-5'>
      {query.data.spaces.map((space) => (
        <section key={space.key} className='space-y-3'>
          <div>
            <h3 className='text-base font-semibold'>{space.key}</h3>
            <p className='text-muted-foreground text-sm'>
              {space.teamScope || t('Film learning space')}
            </p>
          </div>
          <PrivateACUSkillCatalog skills={space.skills} />
        </section>
      ))}
    </div>
  )
}

export function PrivateACUWorkspace(props: {
  section: PrivateACUSection
  learningKind?: string
}) {
  const { t } = useTranslation()
  const role = useAuthStore((state) => state.auth.user?.role ?? ROLE.GUEST)
  const isAdmin = role >= ROLE.ADMIN
  const titleBySection: Record<PrivateACUSection, string> = {
    overview: t('Private ACU'),
    account: t('Account learning'),
    film: t('Film POC'),
    'learning-runs': t('Learning runs'),
    prompts: t('Prompts'),
  }

  let content: React.ReactNode
  if (props.section === 'overview') {
    content = <OverviewPage isAdmin={isAdmin} />
  } else if (props.section === 'account') {
    content = isAdmin ? <PrivateACUAdmin view='account' /> : <MemberFilmPage />
  } else if (props.section === 'film') {
    content = isAdmin ? <PrivateACUFilmPOC /> : <MemberFilmPage />
  } else if (props.section === 'learning-runs') {
    content = isAdmin ? (
      <PrivateACULearningRuns learningKind={props.learningKind} />
    ) : (
      <MemberFilmPage />
    )
  } else {
    content = isAdmin ? <PrivateACUAdmin view='prompts' /> : <MemberFilmPage />
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {titleBySection[props.section]}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-7xl'>{content}</div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

import { SendIcon, SquareIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { ModelSelector } from '@/components/model-group-selector'

import { getInputControlState } from '../../lib'
import type { ModelOption, PlaygroundApiKeyOption } from '../../types'
import { PlaygroundApiKeySelector } from './playground-api-key-selector'

type PlaygroundInputControlsProps = {
  disabled?: boolean
  isGenerating?: boolean
  isModelLoading?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  tokens: PlaygroundApiKeyOption[]
  selectedTokenId: number | null
  onTokenChange: (value: number) => void
  onStop?: () => void
  text: string
  tools: ReactNode
}

export function PlaygroundInputControls(props: PlaygroundInputControlsProps) {
  const { t } = useTranslation()
  const { canSubmit, isSelectorDisabled, shouldShowStop } =
    getInputControlState({
      disabled: props.disabled,
      hasSelectedToken: props.selectedTokenId !== null,
      hasStopHandler: Boolean(props.onStop),
      isGenerating: props.isGenerating,
      isModelLoading: props.isModelLoading,
      models: props.models,
      text: props.text,
    })

  const selectors = (
    <>
      <PlaygroundApiKeySelector
        disabled={props.disabled || props.isModelLoading}
        onTokenChange={props.onTokenChange}
        selectedTokenId={props.selectedTokenId}
        tokens={props.tokens}
      />
      <ModelSelector
        disabled={isSelectorDisabled}
        models={props.models}
        onModelChange={props.onModelChange}
        selectedModel={props.modelValue}
      />
    </>
  )

  const submitButton = shouldShowStop ? (
    <PromptInputButton
      className='border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15 font-medium'
      onClick={props.onStop}
      variant='secondary'
    >
      <SquareIcon className='fill-current' size={16} />
      <span className='hidden sm:inline'>{t('Stop')}</span>
      <span className='sr-only sm:hidden'>{t('Stop')}</span>
    </PromptInputButton>
  ) : (
    <PromptInputButton
      className='bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground h-8 px-3 font-medium shadow-sm'
      disabled={!canSubmit}
      type='submit'
      variant='default'
    >
      <SendIcon size={16} />
      <span className='hidden sm:inline'>{t('Send')}</span>
      <span className='sr-only sm:hidden'>{t('Send')}</span>
    </PromptInputButton>
  )

  return (
    <div className='flex w-full flex-col gap-2.5 md:flex-row md:items-center md:justify-between'>
      <div className='flex min-w-0 items-center justify-end gap-1.5 md:hidden'>
        {selectors}
      </div>
      <div className='flex items-center justify-between gap-2 md:justify-start'>
        {props.tools}
        <div className='flex items-center gap-1.5 md:hidden'>
          {submitButton}
        </div>
      </div>
      <div className='hidden min-w-0 items-center gap-2 md:flex'>
        {selectors}
        {submitButton}
      </div>
    </div>
  )
}

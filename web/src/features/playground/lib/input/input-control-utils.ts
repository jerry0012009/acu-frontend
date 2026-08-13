import type { ModelOption } from '../../types'

type InputControlStateOptions = {
  disabled?: boolean
  hasStopHandler: boolean
  hasSelectedToken: boolean
  isGenerating?: boolean
  isModelLoading?: boolean
  models: ModelOption[]
  text: string
}

type InputControlState = {
  canSubmit: boolean
  isSelectorDisabled: boolean
  shouldShowStop: boolean
}

type SubmittableInputMessage = {
  text?: string | null
}

export function getSubmittableInputText(
  message: SubmittableInputMessage,
  disabled?: boolean
): string | null {
  if (disabled || !message.text?.trim()) {
    return null
  }

  return message.text
}

export function getInputControlState({
  disabled,
  hasStopHandler,
  hasSelectedToken,
  isGenerating,
  isModelLoading,
  models,
  text,
}: InputControlStateOptions): InputControlState {
  const hasModels = models.length > 0

  return {
    canSubmit:
      !disabled && hasModels && hasSelectedToken && text.trim().length > 0,
    isSelectorDisabled: disabled || isModelLoading || !hasSelectedToken,
    shouldShowStop: Boolean(isGenerating && hasStopHandler),
  }
}

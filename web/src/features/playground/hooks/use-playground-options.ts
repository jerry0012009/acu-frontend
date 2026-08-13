import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getACUConversationOptions } from '../api'
import {
  getModelFallback,
  getOptionLoadErrorMessage,
  shouldClearModelForOptions,
} from '../lib'
import type {
  ModelOption,
  PlaygroundApiKeyOption,
  PlaygroundConfig,
} from '../types'

type UsePlaygroundOptionsParams = {
  currentModel: string
  selectedTokenId: number | null
  setModels: (models: ModelOption[]) => void
  setTokens: (tokens: PlaygroundApiKeyOption[]) => void
  updateConfig: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
}

export function usePlaygroundOptions({
  currentModel,
  selectedTokenId,
  setModels,
  setTokens,
  updateConfig,
}: UsePlaygroundOptionsParams) {
  const { t } = useTranslation()
  const { data, error, isError, isLoading } = useQuery({
    queryKey: ['acu-conversation-options', selectedTokenId],
    queryFn: () => getACUConversationOptions(selectedTokenId),
  })

  useEffect(() => {
    if (!isError) return
    toast.error(
      getOptionLoadErrorMessage(
        error,
        t('Failed to load ACU conversation options')
      )
    )
  }, [error, isError, t])

  useEffect(() => {
    if (!data) return

    setTokens(data.tokens)
    setModels(data.models)
    const resolvedTokenId = data.selectedTokenId || null
    if (selectedTokenId !== resolvedTokenId) {
      updateConfig('selectedTokenId', resolvedTokenId)
    }

    const fallback = getModelFallback(data.models, currentModel)
    if (fallback) {
      updateConfig('model', fallback)
      return
    }
    if (shouldClearModelForOptions(data.models, currentModel)) {
      updateConfig('model', '')
    }
  }, [data, currentModel, selectedTokenId, setModels, setTokens, updateConfig])

  return {
    isLoadingModels: isLoading,
  }
}

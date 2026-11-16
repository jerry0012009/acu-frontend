import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useAuthStore } from '@/stores/auth-store'

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
  const userId = useAuthStore((state) => state.auth.user?.id)
  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ['acu-conversation-options', userId, selectedTokenId, 'keys'],
    queryFn: () => getACUConversationOptions(selectedTokenId, false),
  })
  const modelOptions = useQuery({
    queryKey: ['acu-conversation-models', userId, data?.selectedTokenId],
    queryFn: () => getACUConversationOptions(data?.selectedTokenId || null),
    enabled: !!data?.selectedTokenId,
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
    const resolvedTokenId = data.selectedTokenId || null
    if (selectedTokenId !== resolvedTokenId) {
      updateConfig('selectedTokenId', resolvedTokenId)
    }
  }, [data, selectedTokenId, setTokens, updateConfig])

  useEffect(() => {
    const options = modelOptions.data
    if (!options || options.modelsError) return
    setModels(options.models)

    const fallback = getModelFallback(options.models, currentModel)
    if (fallback) {
      updateConfig('model', fallback)
      return
    }
    if (shouldClearModelForOptions(options.models, currentModel)) {
      updateConfig('model', '')
    }
  }, [modelOptions.data, currentModel, setModels, updateConfig])

  return {
    isLoadingModels:
      isLoading || (!!data?.selectedTokenId && modelOptions.isPending),
    hasLoadedOptions: !!data && !isError,
    optionsError: isError
      ? getOptionLoadErrorMessage(
          error,
          t('Failed to load ACU conversation options')
        )
      : modelOptions.data?.modelsError ||
        (modelOptions.isError
          ? t('Failed to load ACU conversation options')
          : ''),
    retryOptions: () => {
      void refetch()
      void modelOptions.refetch()
    },
  }
}

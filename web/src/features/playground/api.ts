import { api } from '@/lib/api'

import { API_ENDPOINTS } from './constants'
import { withPlaygroundTokenHeader } from './lib'
import type {
  ACUConversationOptions,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from './types'

/**
 * Send chat completion request (non-streaming)
 */
export async function sendChatCompletion(
  payload: ChatCompletionRequest,
  selectedTokenId: number | null,
  signal?: AbortSignal
): Promise<ChatCompletionResponse> {
  const res = await api.post(API_ENDPOINTS.CHAT_COMPLETIONS, payload, {
    signal,
    headers: withPlaygroundTokenHeader({}, selectedTokenId),
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

export async function sendImageGeneration(
  payload: ImageGenerationRequest,
  selectedTokenId: number | null,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  const res = await api.post(API_ENDPOINTS.IMAGE_GENERATIONS, payload, {
    signal,
    headers: withPlaygroundTokenHeader({}, selectedTokenId),
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

export async function getACUConversationOptions(
  selectedTokenId: number | null,
  includeModels = true
): Promise<ACUConversationOptions> {
  const runtimeTokenId = Number(
    new URLSearchParams(globalThis.location?.search || '').get('token_id')
  )
  const requested =
    selectedTokenId ||
    (Number.isSafeInteger(runtimeTokenId) && runtimeTokenId > 0
      ? runtimeTokenId
      : null)
  const res = await api.get(API_ENDPOINTS.ACU_CONVERSATION_OPTIONS, {
    params: {
      ...(requested ? { token_id: requested } : {}),
      include_models: includeModels,
    },
  })
  const { data } = res

  if (!data.success || !data.data) {
    throw new Error(data.message || 'Failed to load ACU conversation options')
  }

  return {
    tokens: data.data.tokens.map(
      (token: {
        id: number
        name: string
        masked_key: string
        group: string
        routing_preference: string
      }) => ({
        id: token.id,
        name: token.name,
        maskedKey: token.masked_key,
        group: token.group,
        routingPreference: token.routing_preference,
      })
    ),
    selectedTokenId:
      data.data.tokens.find(
        (token: { id: number }) => token.id === data.data.selected_token_id
      )?.id ||
      data.data.tokens[0]?.id ||
      0,
    models: data.data.models,
    modelsError: data.data.models_error || '',
  }
}

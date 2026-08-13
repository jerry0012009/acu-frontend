import { api } from '@/lib/api'

import { API_ENDPOINTS } from './constants'
import { withPlaygroundTokenHeader } from './lib'
import type {
  ACUConversationOptions,
  ChatCompletionRequest,
  ChatCompletionResponse,
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

export async function getACUConversationOptions(
  selectedTokenId: number | null
): Promise<ACUConversationOptions> {
  const res = await api.get(API_ENDPOINTS.ACU_CONVERSATION_OPTIONS, {
    params: selectedTokenId ? { token_id: selectedTokenId } : undefined,
  })
  const { data } = res

  if (!data.success || !data.data) {
    return { tokens: [], selectedTokenId: 0, models: [] }
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
    selectedTokenId: data.data.selected_token_id,
    models: data.data.models,
  }
}

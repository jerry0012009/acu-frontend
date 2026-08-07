import { api } from '@/lib/api'

import type { ACUSelectionCorridor, PricingData } from './types'

// ----------------------------------------------------------------------------
// Pricing APIs
// ----------------------------------------------------------------------------

// Get model pricing data
export async function getPricing(): Promise<PricingData> {
  const res = await api.get('/api/pricing')
  return res.data
}

export async function getACUSelectionCorridor(
  inputTokens: number,
  outputTokens: number,
  tokenId?: number,
  protocol: 'responses' | 'messages' = 'responses'
): Promise<ACUSelectionCorridor> {
  const path =
    tokenId == null
      ? '/api/pricing/acu-selection-corridor'
      : `/api/pricing/acu-selection-corridor/token/${tokenId}`
  const res = await api.get(path, {
    params: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      protocol,
    },
  })
  return res.data.data
}

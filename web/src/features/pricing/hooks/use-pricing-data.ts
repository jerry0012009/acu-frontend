import { useQuery } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { getApiKeys } from '@/features/keys/api'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { getACUSelectionCorridor, getPricing } from '../api'
import { applyPricingPreview } from '../lib/pricing-comparison'
import type { PricingProtocol } from '../types'

export function usePricingData() {
  const { status } = useStatus()
  const currentUser = useAuthStore((state) => state.auth.user)
  const [inputTokens, setInputTokens] = useState(100_000)
  const [outputTokens, setOutputTokens] = useState(4_000)
  const [pricingProtocol, setPricingProtocol] =
    useState<PricingProtocol>('chat_completions')
  const [previewTokenId, setPreviewTokenId] = useState<number | undefined>()
  useEffect(() => setPreviewTokenId(undefined), [currentUser?.id])
  const deferredInputTokens = useDeferredValue(inputTokens)
  const deferredOutputTokens = useDeferredValue(outputTokens)
  const { data: apiKeys } = useQuery({
    queryKey: ['pricing-preview-api-keys', currentUser?.id],
    queryFn: () => getApiKeys({ p: 1, size: 100 }),
    enabled: currentUser != null,
    staleTime: 60_000,
  })
  const previewQuery = useQuery({
    queryKey: [
      'acu-selection-corridor',
      currentUser?.id,
      deferredInputTokens,
      deferredOutputTokens,
      previewTokenId,
      pricingProtocol,
    ],
    queryFn: () =>
      getACUSelectionCorridor(
        deferredInputTokens,
        deferredOutputTokens,
        previewTokenId,
        pricingProtocol
      ),
    staleTime: 60_000,
    retry: false,
  })
  const previewPending =
    inputTokens !== deferredInputTokens || outputTokens !== deferredOutputTokens
  const selectionCorridor =
    previewPending || previewQuery.isError ? undefined : previewQuery.data
  let quoteStatus: 'loading' | 'error' | 'ready' = 'loading'
  if (previewQuery.isError && !previewPending) quoteStatus = 'error'
  else if (selectionCorridor) quoteStatus = 'ready'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pricing'],
    queryFn: getPricing,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })

  // Ensure rates never reach zero to prevent division errors
  const priceRate = useMemo(
    () => Math.max((status?.price as number) ?? 1, 0.001),
    [status?.price]
  )
  const usdExchangeRate = useMemo(
    () => Math.max((status?.usd_exchange_rate as number) ?? priceRate, 0.001),
    [status?.usd_exchange_rate, priceRate]
  )

  const models = useMemo(() => {
    if (!data?.data || !data?.vendors) return []

    const vendorMap = new Map(data.vendors.map((v) => [v.id, v]))

    const catalogModels = data.data.map((model) => {
      const vendor = model.vendor_id
        ? vendorMap.get(model.vendor_id)
        : undefined
      return {
        ...model,
        key: model.model_name,
        vendor_name: vendor?.name,
        vendor_icon: vendor?.icon,
        vendor_description: vendor?.description,
        group_ratio: data.group_ratio,
      }
    })
    return applyPricingPreview(
      catalogModels,
      selectionCorridor,
      pricingProtocol,
      quoteStatus
    )
  }, [data, selectionCorridor, pricingProtocol, quoteStatus])

  return {
    models,
    vendors: data?.vendors ?? [],
    groupRatio: data?.group_ratio ?? {},
    usableGroup: data?.usable_group ?? {},
    endpointMap: data?.supported_endpoint ?? {},
    autoGroups: data?.auto_groups ?? [],
    isLoading,
    error,
    refetch,
    priceRate,
    usdExchangeRate,
    pricingDisplayMode: data?.acu_pricing_display_mode ?? 'comparison',
    preview: {
      inputTokens,
      setInputTokens,
      outputTokens,
      setOutputTokens,
      pricingProtocol,
      setPricingProtocol,
      previewTokenId,
      setPreviewTokenId,
      apiKeys: apiKeys?.data?.items ?? [],
      loggedIn: currentUser != null,
      selectionCorridor,
      selectionCorridorUnavailable: quoteStatus === 'error',
      isPreviewLoading: quoteStatus === 'loading',
      retry: () => previewQuery.refetch(),
    },
  }
}

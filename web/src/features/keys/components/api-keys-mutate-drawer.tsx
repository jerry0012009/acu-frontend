/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, KeyRound, Settings2, WalletCards } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { useForm, type SubmitErrorHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  sideDrawerSwitchItemClassName,
} from '@/components/drawer-layout'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getACUChannelMonitor } from '@/features/usage-logs/api'
import { useStatus } from '@/hooks/use-status'
import { getUserGroups } from '@/lib/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { createApiKey, updateApiKey, getApiKey } from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  getApiKeyFormSchema,
  type ApiKeyFormValues,
  getApiKeyFormDefaultValues,
  transformFormDataToPayload,
  transformApiKeyToFormDefaults,
} from '../lib'
import type { ApiKey } from '../types'
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from './api-key-group-combobox'
import { useApiKeys } from './api-keys-provider'

type ApiKeyMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: ApiKey
  mode?: 'create' | 'update' | 'clone'
}

export function ApiKeysMutateDrawer({
  open,
  onOpenChange,
  currentRow,
  mode = currentRow ? 'update' : 'create',
}: ApiKeyMutateDrawerProps) {
  const { t } = useTranslation()
  const isUpdate = mode === 'update'
  const isClone = mode === 'clone'
  const { triggerRefresh } = useApiKeys()
  const { status } = useStatus()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [acuModelFilters, setAcuModelFilters] = useState({
    vendor: '',
    protocol: '',
    tier: '',
    reasoningEffort: '',
  })
  const [acuProfileFilters, setAcuProfileFilters] = useState({
    model: '',
    provider: '',
    protocol: '',
  })
  const defaultUseAutoGroup = status?.default_use_auto_group === true

  const { data: modelPoolData } = useQuery({
    queryKey: ['acu-model-pool'],
    queryFn: () => getACUChannelMonitor('24h'),
    enabled: open,
    staleTime: 60_000,
  })

  // Fetch groups
  const { data: groupsData } = useQuery({
    queryKey: ['user-groups'],
    queryFn: getUserGroups,
    enabled: open,
    staleTime: 0,
  })

  const schema = getApiKeyFormSchema(t)

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getApiKeyFormDefaultValues(defaultUseAutoGroup),
  })
  const selectedProfileIds = form.watch('acu_profile_limits')
  const selectedModelScopeCustom = form.watch('acu_model_scope_custom')
  const selectedModelIds = form.watch('model_limits')
  const acuReasoningEffort = acuModelFilters.reasoningEffort
  const groupsRaw = groupsData?.data || {}
  const groups: ApiKeyGroupOption[] = Object.entries(groupsRaw).map(
    ([key, info]) => ({
      value: key,
      label: key,
      desc: info.desc || key,
      ratio: info.ratio,
    })
  )
  const backendHasAuto = groups.some((g) => g.value === 'auto')
  const routingModels = (modelPoolData?.data?.modelPool ?? []).filter(
    (model) =>
      model.modelCategory === 'text_agent' &&
      model.autoRouteEnabled &&
      ['verified', 'verified_provisional'].includes(model.verificationStatus) &&
      (!acuModelFilters.vendor || model.vendor === acuModelFilters.vendor) &&
      (!acuModelFilters.protocol ||
        model.protocols.includes(acuModelFilters.protocol)) &&
      (!acuModelFilters.tier ||
        model.capabilityTier === acuModelFilters.tier) &&
      (!acuReasoningEffort ||
        model.profiles.some((profile) =>
          profile.supportedReasoningEfforts?.includes(acuReasoningEffort)
        ))
  )
  const routingProfileGroups = (modelPoolData?.data?.modelPool ?? [])
    .filter(
      (model) =>
        model.modelCategory === 'text_agent' &&
        model.autoRouteEnabled &&
        ['verified', 'verified_provisional'].includes(
          model.verificationStatus
        ) &&
        (!selectedModelScopeCustom || selectedModelIds.includes(model.modelId))
    )
    .map((model) => ({
      modelId: model.modelId,
      profiles: model.profiles.filter(
        (profile) =>
          profile.enabled &&
          profile.administratorAllowed &&
          (!acuProfileFilters.model ||
            model.modelId === acuProfileFilters.model) &&
          (!acuProfileFilters.provider ||
            profile.provider === acuProfileFilters.provider) &&
          (!acuProfileFilters.protocol ||
            profile.protocol.includes(acuProfileFilters.protocol)) &&
          (!acuReasoningEffort ||
            profile.supportedReasoningEfforts?.includes(acuReasoningEffort))
      ),
    }))
    .filter((group) => group.profiles.length > 0)
  useEffect(() => {
    if (
      !selectedModelScopeCustom ||
      !form.getValues('acu_profile_scope_custom')
    ) {
      return
    }
    const allowed = new Set(selectedModelIds)
    const next = selectedProfileIds.filter((profileId) => {
      const model = (modelPoolData?.data?.modelPool ?? []).find((item) =>
        item.profiles.some(
          (profile) => profile.executionProfileId === profileId
        )
      )
      return model ? allowed.has(model.modelId) : false
    })
    if (next.length !== selectedProfileIds.length) {
      form.setValue('acu_profile_limits', next, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [
    form,
    modelPoolData,
    selectedModelIds,
    selectedModelScopeCustom,
    selectedProfileIds,
  ])
  const selectedProfiles = (modelPoolData?.data?.modelPool ?? [])
    .flatMap((model) =>
      model.profiles.map((profile) => ({ ...profile, modelId: model.modelId }))
    )
    .filter((profile) =>
      selectedProfileIds.includes(profile.executionProfileId)
    )
  const selectedModelCount = new Set(
    selectedProfiles.map((profile) => profile.modelId)
  ).size
  const selectedProviderCount = new Set(
    selectedProfiles.map((profile) => profile.provider)
  ).size
  const singleProfileModelCount = [
    ...new Set(selectedProfiles.map((profile) => profile.modelId)),
  ].filter(
    (modelId) =>
      selectedProfiles.filter((profile) => profile.modelId === modelId)
        .length === 1
  ).length

  // Load existing data when updating
  useEffect(() => {
    if (open && (isUpdate || isClone) && currentRow) {
      void getApiKey(currentRow.id).then((result) => {
        if (result.success && result.data) {
          const defaults = transformApiKeyToFormDefaults(result.data)
          if (isClone) {
            defaults.name = `${defaults.name} copy`
            defaults.remain_quota_dollars = 10
          }
          form.reset(defaults)
        }
      })
    } else if (open && !isUpdate) {
      form.reset(
        getApiKeyFormDefaultValues(defaultUseAutoGroup && backendHasAuto)
      )
    }
  }, [
    open,
    isUpdate,
    isClone,
    currentRow,
    form,
    defaultUseAutoGroup,
    backendHasAuto,
  ])

  // Correct group after groups load: if the form value is not in available groups, fall back
  useEffect(() => {
    if (groups.length === 0) return
    const currentGroup = form.getValues('group')
    if (currentGroup && !groups.some((g) => g.value === currentGroup)) {
      const fallback =
        groups.find((g) => g.value === 'default')?.value ??
        groups[0]?.value ??
        ''
      form.setValue('group', fallback)
      if (currentGroup === 'auto') {
        form.setValue('cross_group_retry', false)
      }
    }
  }, [groups, form])

  const onSubmit = async (data: ApiKeyFormValues) => {
    setIsSubmitting(true)
    try {
      const basePayload = transformFormDataToPayload(data)

      if (isUpdate && currentRow) {
        const result = await updateApiKey({
          ...basePayload,
          id: currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
          onOpenChange(false)
          triggerRefresh()
        } else {
          toast.error(result.message || t(ERROR_MESSAGES.UPDATE_FAILED))
        }
      } else {
        // Create mode - handle batch creation
        const count = data.tokenCount || 1
        let successCount = 0

        for (let i = 0; i < count; i++) {
          const result = await createApiKey({
            ...basePayload,
            name:
              i === 0 && data.name
                ? data.name
                : `${data.name || 'default'}-${Math.random().toString(36).slice(2, 8)}`,
          })
          if (result.success) {
            successCount++
          } else {
            toast.error(result.message || t(ERROR_MESSAGES.CREATE_FAILED))
            break
          }
        }

        if (successCount > 0) {
          toast.success(
            t('Successfully created {{count}} API Key(s)', {
              count: successCount,
            })
          )
          onOpenChange(false)
          triggerRefresh()
        }
      }
    } catch {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onInvalid: SubmitErrorHandler<ApiKeyFormValues> = () => {
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  const handleSetExpiry = (months: number, days: number, hours: number) => {
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', undefined)
      return
    }

    const now = new Date()
    now.setMonth(now.getMonth() + months)
    now.setDate(now.getDate() + days)
    now.setHours(now.getHours() + hours)

    form.setValue('expired_time', now)
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaLabel = t('Quota ({{currency}})', { currency: currencyLabel })
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })
  const selectedGroup = form.watch('group')
  const unlimitedQuota = form.watch('unlimited_quota')
  let drawerTitle = t('Create API Key')
  if (isUpdate) drawerTitle = t('Update API Key')
  if (isClone) drawerTitle = t('Copy and create API Key')

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[620px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{drawerTitle}</SheetTitle>
          <SheetDescription>
            {isUpdate
              ? t('Update the API key by providing necessary info.')
              : t('Add a new API key by providing necessary info.')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='api-key-form'
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            className={sideDrawerFormClassName('gap-5')}
          >
            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Basic Information')}
                description={t('Set API key basic information')}
                icon={<KeyRound className='size-4' />}
                iconTone='info'
              />
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Enter a name')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='group'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Group')}</FormLabel>
                    <FormControl>
                      <ApiKeyGroupCombobox
                        options={groups}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t('Select a group')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedGroup === 'auto' && (
                <FormField
                  control={form.control}
                  name='cross_group_retry'
                  render={({ field }) => (
                    <FormItem className={sideDrawerSwitchItemClassName()}>
                      <div className='flex flex-col gap-0.5'>
                        <FormLabel className='text-sm'>
                          {t('Cross-group retry')}
                        </FormLabel>
                        <FormDescription className='line-clamp-2 text-xs sm:line-clamp-none'>
                          {t(
                            'When enabled, if channels in the current group fail, it will try channels in the next group in order.'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='expired_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expiration Time')}</FormLabel>
                    <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('Never expires')}
                          className='min-w-0 [&_input[type=time]]:w-24 sm:[&_input[type=time]]:w-32'
                        />
                      </FormControl>
                      <div className='grid grid-cols-4 gap-2 sm:flex'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 0)}
                        >
                          {t('Never')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(1, 0, 0)}
                        >
                          {t('1 Month')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 1, 0)}
                        >
                          {t('1 Day')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 1)}
                        >
                          {t('1 Hour')}
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isUpdate && (
                <FormField
                  control={form.control}
                  name='tokenCount'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Quantity')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min='1'
                          placeholder={t('Number of keys to create')}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseInt(e.target.value, 10) || 1
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Create multiple API keys at once (random suffix will be added to names)'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </SideDrawerSection>

            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Quota Settings')}
                description={t('Set quota amount and limits')}
                icon={<WalletCards className='size-4' />}
                iconTone='success'
              />
              {!unlimitedQuota && (
                <FormField
                  control={form.control}
                  name='remain_quota_dollars'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{quotaLabel}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          step={tokensOnly ? 1 : 0.01}
                          placeholder={quotaPlaceholder}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {tokensOnly
                          ? t('Enter the quota amount in tokens')
                          : t('Enter the quota amount in {{currency}}', {
                              currency: currencyLabel,
                            })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='unlimited_quota'
                render={({ field }) => (
                  <FormItem className={sideDrawerSwitchItemClassName()}>
                    <div className='flex flex-col gap-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Unlimited Quota')}
                      </FormLabel>
                      <FormDescription className='text-xs'>
                        {t('Enable unlimited quota for this API key')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </SideDrawerSection>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <SideDrawerSection>
                <CollapsibleTrigger
                  render={
                    <button
                      type='button'
                      className='hover:bg-muted/40 flex w-full items-center gap-3 rounded-md py-1.5 text-left transition-colors'
                    />
                  }
                >
                  <SideDrawerSectionHeader
                    className='flex-1'
                    title={t('Advanced Settings')}
                    description={t('Set API key access restrictions')}
                    icon={<Settings2 className='size-4' />}
                  />
                  <ChevronDown
                    className={cn(
                      'text-muted-foreground size-4 shrink-0 transition-transform',
                      advancedOpen && 'rotate-180'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className='flex flex-col gap-4 pt-2'>
                    <FormField
                      control={form.control}
                      name='acu_quality_mode'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Quality preference')}</FormLabel>
                          <FormControl>
                            <select
                              className='bg-background h-9 w-full rounded border px-2 text-sm'
                              value={field.value}
                              onChange={field.onChange}
                            >
                              <option value='economy'>{t('Economy')}</option>
                              <option value='balanced'>{t('Balanced')}</option>
                              <option value='quality'>{t('Quality')}</option>
                              <option value='custom'>{t('Custom')}</option>
                            </select>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {form.watch('acu_quality_mode') === 'custom' && (
                      <FormField
                        control={form.control}
                        name='acu_quality_bias'
                        render={({ field }) => (
                          <FormItem>
                            <div className='flex items-center justify-between gap-3'>
                              <FormLabel>{t('Custom quality bias')}</FormLabel>
                              <Input
                                aria-label={t('Custom quality bias')}
                                type='number'
                                min={-100}
                                max={100}
                                step={1}
                                className='h-8 w-24 rounded-md'
                                value={field.value}
                                onChange={(event) =>
                                  field.onChange(
                                    Math.max(
                                      -100,
                                      Math.min(100, Number(event.target.value))
                                    )
                                  )
                                }
                              />
                            </div>
                            <FormControl>
                              <Slider
                                min={-100}
                                max={100}
                                step={1}
                                value={[field.value]}
                                onValueChange={(value) =>
                                  field.onChange(
                                    Array.isArray(value)
                                      ? (value[0] ?? 0)
                                      : value
                                  )
                                }
                              />
                            </FormControl>
                            <FormDescription className='text-xs'>
                              {t(
                                '-100 compares only model cost; 0 weighs quality and cost equally; +100 compares only conservative model quality.'
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name='acu_supply_strategy'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Supply strategy')}</FormLabel>
                          <FormControl>
                            <select
                              className='bg-background h-9 w-full rounded-md border px-2 text-sm'
                              value={field.value}
                              onChange={field.onChange}
                            >
                              <option value='lowest_cost'>
                                {t('Lowest cost')}
                              </option>
                              <option value='balanced'>{t('Balanced')}</option>
                              <option value='low_latency'>
                                {t('Low latency')}
                              </option>
                              <option value='high_reliability'>
                                {t('High reliability')}
                              </option>
                            </select>
                          </FormControl>
                          <FormDescription className='text-xs'>
                            {t(
                              'Chooses the execution Profile for the selected canonical model.'
                            )}
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='acu_model_scope_custom'
                      render={({ field }) => (
                        <FormItem className={sideDrawerSwitchItemClassName()}>
                          <div className='flex flex-col gap-0.5'>
                            <FormLabel className='text-sm'>
                              {t('ACU routing model scope')}
                            </FormLabel>
                            <FormDescription className='text-xs'>
                              {field.value
                                ? t('Custom allowed models')
                                : t('All verified routing-eligible models')}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {form.watch('acu_model_scope_custom') && (
                      <>
                        <div className='grid grid-cols-3 gap-2'>
                          {(
                            [
                              [
                                'vendor',
                                [
                                  ...new Set(
                                    (modelPoolData?.data?.modelPool ?? []).map(
                                      (item) => item.vendor
                                    )
                                  ),
                                ],
                              ],
                              [
                                'protocol',
                                [
                                  ...new Set(
                                    (
                                      modelPoolData?.data?.modelPool ?? []
                                    ).flatMap((item) => item.protocols)
                                  ),
                                ],
                              ],
                              [
                                'tier',
                                [
                                  ...new Set(
                                    (modelPoolData?.data?.modelPool ?? []).map(
                                      (item) => item.capabilityTier
                                    )
                                  ),
                                ],
                              ],
                              [
                                'reasoningEffort',
                                [
                                  ...new Set(
                                    (
                                      modelPoolData?.data?.profiles ?? []
                                    ).flatMap(
                                      (item) =>
                                        item.supportedReasoningEfforts ?? []
                                    )
                                  ),
                                ],
                              ],
                            ] as const
                          ).map(([key, values]) => (
                            <select
                              key={key}
                              aria-label={key}
                              className='bg-background h-9 min-w-0 rounded border px-2 text-xs'
                              value={acuModelFilters[key]}
                              onChange={(event) =>
                                setAcuModelFilters((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            >
                              <option value=''>
                                {t('All')} {t(key)}
                              </option>
                              {[...values].sort().map((value: string) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          ))}
                        </div>
                        <FormField
                          control={form.control}
                          name='model_limits'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {t('Custom allowed models')}
                              </FormLabel>
                              <FormControl>
                                <MultiSelect
                                  options={routingModels.map((model) => ({
                                    label: `${model.modelId} · ${model.vendor} · ${model.capabilityTier}`,
                                    value: model.modelId,
                                  }))}
                                  selected={field.value}
                                  onChange={field.onChange}
                                  placeholder={t('Select verified models')}
                                />
                              </FormControl>
                              <FormDescription>
                                {t(
                                  'Virtual ACU entry models are allowed automatically'
                                )}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <FormField
                      control={form.control}
                      name='acu_profile_scope_custom'
                      render={({ field }) => (
                        <FormItem className={sideDrawerSwitchItemClassName()}>
                          <div className='flex flex-col gap-0.5'>
                            <FormLabel className='text-sm'>
                              {t('ACU execution Profile scope')}
                            </FormLabel>
                            <FormDescription className='text-xs'>
                              {field.value
                                ? t('Custom allowed execution Profiles')
                                : t('All verified execution Profiles')}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {form.watch('acu_profile_scope_custom') && (
                      <FormItem>
                        <FormLabel>{t('Allowed execution Profiles')}</FormLabel>
                        <div className='grid grid-cols-3 gap-2'>
                          {(
                            [
                              [
                                'model',
                                [
                                  ...new Set(
                                    (modelPoolData?.data?.modelPool ?? []).map(
                                      (item) => item.modelId
                                    )
                                  ),
                                ],
                              ],
                              [
                                'provider',
                                [
                                  ...new Set(
                                    (modelPoolData?.data?.profiles ?? []).map(
                                      (item) => item.provider
                                    )
                                  ),
                                ],
                              ],
                              [
                                'protocol',
                                [
                                  ...new Set(
                                    (
                                      modelPoolData?.data?.profiles ?? []
                                    ).flatMap((item) => item.protocol)
                                  ),
                                ],
                              ],
                            ] as const
                          ).map(([key, values]) => (
                            <select
                              key={key}
                              aria-label={`profile-${key}`}
                              className='bg-background h-9 min-w-0 rounded border px-2 text-xs'
                              value={acuProfileFilters[key]}
                              onChange={(event) =>
                                setAcuProfileFilters((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            >
                              <option value=''>
                                {t('All')} {t(key)}
                              </option>
                              {[...values].sort().map((value: string) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          ))}
                        </div>
                        <div className='max-h-72 space-y-2 overflow-y-auto rounded border p-2'>
                          {routingProfileGroups.map((group) => {
                            const groupIds = group.profiles.map(
                              (profile) => profile.executionProfileId
                            )
                            const selectedCount = groupIds.filter((profileId) =>
                              selectedProfileIds.includes(profileId)
                            ).length
                            return (
                              <div key={group.modelId} className='space-y-1.5'>
                                <label className='flex items-center gap-2 text-xs font-medium'>
                                  <TriStateCheckbox
                                    checked={selectedCount === groupIds.length}
                                    indeterminate={
                                      selectedCount > 0 &&
                                      selectedCount < groupIds.length
                                    }
                                    onChange={(checked) => {
                                      const next = checked
                                        ? [
                                            ...new Set([
                                              ...selectedProfileIds,
                                              ...groupIds,
                                            ]),
                                          ]
                                        : selectedProfileIds.filter(
                                            (profileId) =>
                                              !groupIds.includes(profileId)
                                          )
                                      form.setValue(
                                        'acu_profile_limits',
                                        next,
                                        {
                                          shouldDirty: true,
                                          shouldValidate: true,
                                        }
                                      )
                                    }}
                                  />
                                  {group.modelId}
                                </label>
                                <div className='space-y-1 pl-6'>
                                  {group.profiles.map((profile) => (
                                    <label
                                      key={profile.executionProfileId}
                                      className='flex items-start gap-2 text-xs'
                                    >
                                      <input
                                        type='checkbox'
                                        className='mt-0.5 size-4'
                                        checked={selectedProfileIds.includes(
                                          profile.executionProfileId
                                        )}
                                        onChange={(event) => {
                                          const next = event.target.checked
                                            ? [
                                                ...new Set([
                                                  ...selectedProfileIds,
                                                  profile.executionProfileId,
                                                ]),
                                              ]
                                            : selectedProfileIds.filter(
                                                (profileId) =>
                                                  profileId !==
                                                  profile.executionProfileId
                                              )
                                          form.setValue(
                                            'acu_profile_limits',
                                            next,
                                            {
                                              shouldDirty: true,
                                              shouldValidate: true,
                                            }
                                          )
                                        }}
                                      />
                                      <span>
                                        {profile.provider} / {profile.channel} /{' '}
                                        {profile.protocol.join(', ')} /{' '}
                                        {profile.multiplier ?? 'n/a'}x /{' '}
                                        {profile.routingEligibility}
                                        {profile.supportedReasoningEfforts
                                          ?.length
                                          ? ` / ${profile.supportedReasoningEfforts.join(', ')}`
                                          : ' / default'}
                                        <span className='text-muted-foreground block break-all'>
                                          {profile.executionProfileId}
                                        </span>
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className='bg-muted/40 grid grid-cols-2 gap-2 rounded p-2 text-xs sm:grid-cols-4'>
                          <span>
                            {selectedProfileIds.length} {t('Profiles')}
                          </span>
                          <span>
                            {selectedModelCount} {t('Models')}
                          </span>
                          <span>
                            {selectedProviderCount} {t('Providers')}
                          </span>
                          <span>
                            {singleProfileModelCount}{' '}
                            {t('Single-profile models')}
                          </span>
                        </div>
                        {form.formState.errors.acu_profile_limits?.message && (
                          <p className='text-destructive text-xs'>
                            {form.formState.errors.acu_profile_limits.message}
                          </p>
                        )}
                      </FormItem>
                    )}

                    <FormField
                      control={form.control}
                      name='allow_ips'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('IP Whitelist (supports CIDR)')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className='min-h-20 resize-none'
                              placeholder={t(
                                'One IP per line (empty for no restriction)'
                              )}
                              rows={3}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </SideDrawerSection>
            </Collapsible>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose
            render={<Button variant='outline' className='w-full sm:w-auto' />}
          >
            {t('Close')}
          </SheetClose>
          <Button
            type='button'
            onClick={form.handleSubmit(onSubmit, onInvalid)}
            disabled={isSubmitting}
            className='w-full sm:w-auto'
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function TriStateCheckbox(props: {
  checked: boolean
  indeterminate: boolean
  onChange: (checked: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = props.indeterminate
  }, [props.indeterminate])
  return (
    <input
      ref={inputRef}
      type='checkbox'
      className='size-4'
      checked={props.checked}
      aria-checked={props.indeterminate ? 'mixed' : props.checked}
      onChange={(event) => props.onChange(event.target.checked)}
    />
  )
}

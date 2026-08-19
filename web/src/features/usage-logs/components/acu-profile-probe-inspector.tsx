import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import type {
  ACUChannelMonitorProfile,
  ACUExecutionProfileProbeResult,
} from '../api'
import { ACUProbeResultPanel } from './acu-probe-result-panel'

export function ACUProfileProbeInspector(props: {
  open: boolean
  profile: ACUChannelMonitorProfile | null
  protocol: string | null
  loading: boolean
  result: ACUExecutionProfileProbeResult | null
  requestError?: string
  savePending?: boolean
  saveMessage?: string
  onOpenChange: (open: boolean) => void
  onSaveCalibration: (input: {
    observedBillingMultiplier: number
    creditsPerCny?: number
  }) => void
}) {
  const { t } = useTranslation()
  const [actualDebit, setActualDebit] = useState('')
  const [calibrationMultiplier, setCalibrationMultiplier] = useState('')
  const [calibrationCreditsPerCny, setCalibrationCreditsPerCny] = useState('')
  const [calibrationError, setCalibrationError] = useState('')

  useEffect(() => {
    setActualDebit('')
    setCalibrationError('')
    const multiplier = Number(props.result?.costBreakdown.billingMultiplier)
    const providerCreditCashCostCny = Number(
      props.result?.costBreakdown.providerCreditCashCostCny
    )
    setCalibrationMultiplier(
      Number.isFinite(multiplier) && multiplier > 0
        ? multiplier.toFixed(4)
        : (props.profile?.multiplier?.toString() ?? '')
    )
    setCalibrationCreditsPerCny(
      Number.isFinite(providerCreditCashCostCny) &&
        providerCreditCashCostCny > 0
        ? (1 / providerCreditCashCostCny).toFixed(4)
        : ''
    )
  }, [props.profile, props.result])

  const saveCalibration = () => {
    const observedBillingMultiplier = Number(calibrationMultiplier)
    if (
      !Number.isFinite(observedBillingMultiplier) ||
      observedBillingMultiplier <= 0
    ) {
      setCalibrationError(t('Calibration values must be greater than zero'))
      return
    }
    const input: {
      observedBillingMultiplier: number
      creditsPerCny?: number
    } = { observedBillingMultiplier }
    if (calibrationCreditsPerCny.trim()) {
      const creditsPerCny = Number(calibrationCreditsPerCny)
      if (!Number.isFinite(creditsPerCny) || creditsPerCny <= 0) {
        setCalibrationError(t('Calibration values must be greater than zero'))
        return
      }
      input.creditsPerCny = creditsPerCny
    }
    setCalibrationError('')
    props.onSaveCalibration(input)
  }

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side='right' className='sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>{t('Probe Inspector')}</SheetTitle>
          <SheetDescription>
            {props.profile?.executionProfileId ?? t('ACU Route')} ·{' '}
            {props.protocol ?? t('targeted probe')}
          </SheetDescription>
        </SheetHeader>
        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto px-4 text-xs'>
          {props.loading && (
            <div className='text-muted-foreground rounded border p-3'>
              {t('Running targeted Probe...')}
            </div>
          )}
          {props.requestError && (
            <div className='text-destructive rounded border border-red-300 p-3'>
              {props.requestError}
            </div>
          )}
          {props.result && (
            <>
              <div className='text-muted-foreground grid grid-cols-2 gap-2 border-b pb-3'>
                <span>{t('Started')}</span>
                <span>{new Date(props.result.startedAt).toLocaleString()}</span>
                <span>{t('Completed')}</span>
                <span>
                  {new Date(props.result.completedAt).toLocaleString()}
                </span>
                <span>{t('Protocol')}</span>
                <span>{props.result.protocol}</span>
              </div>
              <ACUProbeResultPanel
                result={props.result}
                currentMultiplier={props.profile?.multiplier ?? undefined}
                actualDebit={actualDebit}
                onActualDebitChange={setActualDebit}
                onUseRecommended={(value) =>
                  setCalibrationMultiplier(value.toString())
                }
                showCalibration
                calibrationMultiplier={calibrationMultiplier}
                calibrationCreditsPerCny={calibrationCreditsPerCny}
                onCalibrationMultiplierChange={(value) => {
                  setCalibrationError('')
                  setCalibrationMultiplier(value)
                }}
                onCalibrationCreditsPerCnyChange={(value) => {
                  setCalibrationError('')
                  setCalibrationCreditsPerCny(value)
                }}
                onSaveCalibration={saveCalibration}
                savePending={props.savePending}
                saveMessage={calibrationError || props.saveMessage}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

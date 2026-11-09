import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { getApiKeys, fetchTokenKey } from '@/features/keys/api'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  ACU_API_BASE_URL,
  ACU_DEFAULT_MODEL,
  normalizeApiKey,
} from '../lib/quick-start'
import { onboardingPending, isRuntimeLogin } from '../lib/runtime-onboarding'
import { AcuQuickStart } from './acu-quick-start'

export function ConnectionGuide() {
  const userID = useAuthStore((state) => state.auth.user?.id)
  return <AccountConnectPage key={userID ?? 'public'} />
}

function AccountConnectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.auth.user)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [key, setKey] = useState('')
  async function dismiss() {
    if (!user) return
    setSaving(true)
    setError('')
    try {
      const response = await api.put('/api/user/self', {
        acu_onboarding_complete: true,
      })
      if (!response.data.success) {
        throw new Error(t('Could not save your preference. Please try again.'))
      }
      const settings =
        typeof user.setting === 'string'
          ? JSON.parse(user.setting)
          : (user.setting ?? {})
      useAuthStore.getState().auth.setUser({
        ...user,
        setting: { ...settings, acu_onboarding_pending: false },
      })
      await navigate({ to: '/dashboard' })
    } catch {
      setError(t('Could not save your preference. Please try again.'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className='acu-guide-account'>
      <AcuQuickStart
        storefront
        mode={key ? 'credentialed' : 'preview'}
        compact
        tokenKey={key}
        className='max-w-none'
        connectionSummary={<DirectCredentials onKey={setKey} />}
      />
      {user && (user.quota ?? 0) <= 0 ? (
        <p className='acu-guide-balance'>
          {t(
            'Your key uses your account balance. Add funds before making paid requests.'
          )}{' '}
          <Link to='/wallet' className='underline underline-offset-4'>
            {t('Wallet')}
          </Link>
        </p>
      ) : null}
      {user ? (
        <div className='acu-guide-account-footer'>
          <Link
            to='/dashboard'
            className='text-muted-foreground inline-flex items-center gap-2 text-sm'
          >
            {t('Go to console')}
            <ArrowRight className='size-4' />
          </Link>
          {onboardingPending(user) && !isRuntimeLogin(document) ? (
            <Button variant='ghost' disabled={saving} onClick={dismiss}>
              {t('Do not show this guide on sign-in')}
            </Button>
          ) : null}
          {error ? (
            <p role='alert' className='text-destructive w-full text-sm'>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DirectCredentials(props: { onKey: (key: string) => void }) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const [key, setKey] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const clearKey = props.onKey
  useEffect(() => () => clearKey(''), [clearKey])
  const keys = useQuery({
    queryKey: ['connect-api-keys', user?.id],
    queryFn: async () => {
      const result = await getApiKeys({ size: 100 })
      if (!result.success || !result.data) throw new Error('keys unavailable')
      return result.data.items
    },
    enabled: !!user,
    retry: false,
  })
  const available = keys.data?.find(
    (item) =>
      item.status === 1 &&
      (item.expired_time <= 0 || item.expired_time > Date.now() / 1000) &&
      (item.unlimited_quota || item.remain_quota > 0)
  )
  async function reveal() {
    if (key) {
      props.onKey(visible ? '' : key)
      setVisible(!visible)
      return
    }
    if (!available) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchTokenKey(available.id)
      if (!result.success || !result.data?.key) {
        throw new Error('key unavailable')
      }
      const value = normalizeApiKey(result.data.key)
      setKey(value)
      setVisible(true)
      props.onKey(value)
    } catch {
      setError(t('Could not load your API key. Please try again.'))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className='acu-credential-section'>
      <h3 className='text-base font-medium'>{t('Your connection details')}</h3>
      {user ? (
        <>
          <div className='acu-credential-row'>
            <span className='acu-credential-label'>API Key</span>
            <div className='acu-key-controls'>
              <input
                aria-label='API Key'
                type={visible ? 'text' : 'password'}
                readOnly
                value={key || 'sk-hidden-key'}
                className='bg-muted min-w-0 flex-1 rounded-md px-3 py-2 font-mono text-xs'
              />
              <Button
                variant='ghost'
                size='icon'
                aria-label={t(visible ? 'Hide API key' : 'Show API key')}
                onClick={reveal}
                disabled={!available || loading}
              >
                {visible ? (
                  <EyeOff className='size-4' />
                ) : (
                  <Eye className='size-4' />
                )}
              </Button>
              {key ? (
                <CopyButton value={key} aria-label={t('Copy API key')} />
              ) : null}
            </div>
          </div>
          {keys.isPending ? (
            <p role='status' className='text-muted-foreground text-xs'>
              {t('Loading your keys…')}
            </p>
          ) : null}
          {keys.isError ? (
            <p role='alert' className='text-destructive text-sm'>
              {t('Could not load your keys.')}{' '}
              <button
                type='button'
                onClick={() => keys.refetch()}
                className='underline'
              >
                {t('Retry')}
              </button>
            </p>
          ) : null}
          {keys.isSuccess && !available ? (
            <Link to='/keys' className='text-sm underline'>
              {t('Create or enable an API key')}
            </Link>
          ) : null}
          {error ? (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          ) : null}
          {(user.quota ?? 0) <= 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t(
                'Your key uses your account balance. Add funds before making paid requests.'
              )}{' '}
              <Link to='/wallet' className='underline'>
                {t('Wallet')}
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <Link
          to='/sign-in'
          search={{ redirect: '/#start' }}
          className='text-sm underline'
        >
          {t('Sign in to view your API key')}
        </Link>
      )}
      {[
        [t('API address'), ACU_API_BASE_URL],
        [t('Recommended model'), ACU_DEFAULT_MODEL],
      ].map(([label, value]) => (
        <div key={label} className='acu-credential-row'>
          <span className='acu-credential-label'>{label}</span>
          <code className='min-w-0 flex-1 text-xs break-all'>{value}</code>
          <CopyButton value={value} aria-label={`${t('Copy')} ${label}`} />
        </div>
      ))}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Choose an application below for its exact endpoint and configuration. No Runtime download is required.'
        )}
      </p>
    </div>
  )
}

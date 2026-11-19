import assert from 'node:assert/strict'
import { afterEach, before, test } from 'node:test'

import { AxiosError, CanceledError } from 'axios'
import i18next from 'i18next'
import { toast } from 'sonner'

import { handleServerError } from '../handle-server-error'
import { api } from '../http-client'

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator'
)

before(async () => {
  await i18next.init({ lng: 'en', resources: { en: { translation: {} } } })
})

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator)
  } else {
    Reflect.deleteProperty(globalThis, 'navigator')
  }
})

function setOnline(value: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: value },
  })
}

function failNetworkRequests() {
  return Promise.allSettled(
    ['/notice', '/status', '/advisor'].map((url) =>
      api.get(url, {
        adapter: async (config) => {
          throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)
        },
      })
    )
  )
}

test('when the browser is offline, concurrent requests still reject without creating error toasts', async () => {
  setOnline(false)
  const before = toast.getHistory().length
  const results = await failNetworkRequests()
  assert.ok(results.every((result) => result.status === 'rejected'))
  assert.equal(toast.getHistory().length, before)
})

test('when the browser reports online, a burst of transport failures shares one localized toast', async () => {
  setOnline(true)
  const before = toast.getHistory().length
  const results = await failNetworkRequests()
  const failure = results[0]
  assert.equal(failure.status, 'rejected')
  handleServerError(failure.reason)
  const notices = toast.getHistory().slice(before)
  assert.equal(notices.length, 1)
  assert.ok('title' in notices[0])
  assert.equal(
    notices[0].title,
    'Network connection failed or server not responding'
  )
})

test('a canceled request does not show an error in either shared handler', async () => {
  const before = toast.getHistory().length
  const failure = new CanceledError()
  await assert.rejects(
    api.get('/canceled', {
      adapter: async () => {
        throw failure
      },
    }),
    (error) => error === failure
  )
  handleServerError(failure)
  assert.equal(toast.getHistory().length, before)
})

test('an HTTP failure keeps the server message even when the browser has just gone offline', async () => {
  setOnline(false)
  const before = toast.getHistory().length
  await assert.rejects(
    api.get('/denied', {
      adapter: async (config) => {
        throw new AxiosError(
          'Forbidden',
          AxiosError.ERR_BAD_REQUEST,
          config,
          undefined,
          {
            config,
            status: 403,
            statusText: 'Forbidden',
            headers: {},
            data: { message: 'Permission denied' },
          }
        )
      },
    })
  )
  const notice = toast.getHistory()[before]
  assert.ok('title' in notice)
  assert.equal(notice.title, 'Permission denied')
})

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import type { AxiosResponse } from 'axios'

import { api } from '@/lib/api'

import { getAllUsers } from '../api'
import type { GetUsersResponse, User } from '../types'

const originalGet = api.get

afterEach(() => {
  api.get = originalGet
})

test('loads every user page when the admin list exceeds the 100-user limit', async () => {
  const requestedPages: number[] = []
  api.get = (async (
    _url: string,
    config?: { params?: { p?: number; page_size?: number } }
  ) => {
    const page = config?.params?.p ?? 1
    const pageSize = config?.params?.page_size ?? 10
    requestedPages.push(page)
    const start = (page - 1) * pageSize + 1
    const end = Math.min(start + pageSize - 1, 165)
    const items = Array.from({ length: end - start + 1 }, (_, index) => {
      const id = start + index
      return { id, username: `user-${id}` } as User
    })
    return {
      data: {
        success: true,
        data: { items, total: 165, page, page_size: pageSize },
      } satisfies GetUsersResponse,
    } as AxiosResponse
  }) as typeof api.get

  const result = await getAllUsers({ sort_by: 'id', sort_order: 'asc' })

  assert.deepEqual(requestedPages, [1, 2])
  assert.equal(result.data?.items.length, 165)
  assert.equal(result.data?.items.at(-1)?.id, 165)
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { loginFormSchema, registerFormSchema } from '../constants'

const registration = (password: string) => ({
  username: 'password-user',
  password,
  confirmPassword: password,
})

describe('registration password policy', () => {
  for (const [name, password] of [
    ['32 characters', 'x'.repeat(32)],
    ['72 byte boundary', 'x'.repeat(72)],
    ['unicode byte boundary', '界'.repeat(24)],
  ]) {
    test(`accepts ${name}`, () => {
      assert.equal(
        registerFormSchema.safeParse(registration(password)).success,
        true
      )
    })
  }
  for (const [name, password] of [
    ['ASCII byte overflow', 'x'.repeat(73)],
    ['unicode byte overflow', '界'.repeat(25)],
    ['seven emoji characters', '🔑'.repeat(7)],
    ['seven ASCII characters', 'x'.repeat(7)],
  ]) {
    test(`rejects ${name}`, () => {
      assert.equal(
        registerFormSchema.safeParse(registration(password)).success,
        false
      )
    })
  }
  test('login preserves existing short credentials', () => {
    assert.equal(
      loginFormSchema.safeParse({ username: 'legacy-user', password: 'short' })
        .success,
      true
    )
  })
})

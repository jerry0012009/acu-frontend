import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_BYTES = 72

// Go validates Unicode characters for the minimum and UTF-8 bytes for bcrypt.
export const newPasswordSchema = z
  .string()
  .refine((value) => [...value].length >= PASSWORD_MIN_LENGTH, {
    message: 'Password must be at least 8 characters',
  })
  .refine(
    (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES,
    {
      message: 'Password must be at most 72 bytes',
    }
  )

/** Preserve decimal strings from billing JSON; only expand scientific notation. */
export function formatExactDecimal(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value)
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!match || (!match[2] && !match[3])) return undefined
  if (match[4] == null) return text

  const exponent = Number(match[4])
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) {
    return undefined
  }
  const digits = match[2] + (match[3] ?? '')
  const point = match[2].length + exponent
  if (point <= 0) return `${match[1]}0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) {
    return `${match[1]}${digits}${'0'.repeat(point - digits.length)}`
  }
  return `${match[1]}${digits.slice(0, point)}.${digits.slice(point)}`
}

/** Keep the familiar eight-place list minimum without discarding smaller charges. */
export function formatListDecimal(value: unknown): string | undefined {
  const exact = formatExactDecimal(value)
  if (exact == null) return undefined
  const [integer, fraction = ''] = exact.split('.')
  return `${integer || '0'}.${fraction.replace(/0+$/, '').padEnd(8, '0')}`
}

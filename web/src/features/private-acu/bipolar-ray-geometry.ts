export function bipolarRayGeometry(
  id: string,
  index: number,
  count: number,
  position: number
): { angle: number; radius: number } {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const jitter = ((hash % 101) / 100 - 0.5) * 0.18
  const base = ((index + jitter) * Math.PI) / count - Math.PI / 2
  return {
    angle: base + (position < 60 ? Math.PI : 0),
    radius: 250 * Math.abs((position - 60) / 60),
  }
}

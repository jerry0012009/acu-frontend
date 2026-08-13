export const PLAYGROUND_TOKEN_HEADER = 'X-ACU-Playground-Token-Id'

export function withPlaygroundTokenHeader(
  headers: Record<string, string>,
  selectedTokenId: number | null
): Record<string, string> {
  if (!selectedTokenId) {
    return headers
  }
  return {
    ...headers,
    [PLAYGROUND_TOKEN_HEADER]: String(selectedTokenId),
  }
}
